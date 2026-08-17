/*
  VIPS Library RFID Gate
  ----------------------
  Hardware:
    - ESP32 DevKit
    - EM-18 RFID reader
    - SSD1306 128x64 OLED (I2C)
    - Status LED

  Purpose:
    - Record immutable RFID scan events with an exact timestamp.
    - Backend decides IN / OUT / duplicate / closed-hours.
    - Supports multiple readers safely because the ESP32 never toggles local presence state.
    - Uses an idempotent eventId so retrying a scan cannot accidentally toggle IN/OUT twice.
    - Queues failed/offline scans in ESP32 Preferences (NVS) so short outages/reboots do not lose them.

  Required backend endpoints:
    POST /api/device/register
    GET  /api/device/time
    POST /api/device/heartbeat
    POST /api/library/scan

  IMPORTANT:
    - Change BACKEND_URL.
    - Change ENROLLMENT_KEY and protect the matching backend endpoint.
    - For production, replace insecure TLS with certificate validation.
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <time.h>
#include <sys/time.h>
#include <esp_system.h>

// ============================================================
//                         CONFIG
// ============================================================

#define DEVICE_NAME          "VIPS Library Gate"
#define BACKEND_URL          "https://vips-library.vercel.app"
#define FIRMWARE_VERSION     "1.0.2"

// Shared only for initial device enrollment.
// Replace before deployment and validate it server-side.
#define ENROLLMENT_KEY       "replace-with-another-long-random-secret"

// Setup AP password. Minimum 8 characters.
#define SETUP_AP_PASSWORD    "LibrarySetup"

// India / IST
#define GMT_OFFSET_SEC       19800
#define DAYLIGHT_OFFSET_SEC  0

// ============================================================
//                          PINS
// ============================================================

#define LED_PIN       4
#define EM18_RX_PIN   16
#define EM18_TX_PIN   17

#define OLED_SDA_PIN  21
#define OLED_SCL_PIN  22

// ============================================================
//                         TIMING
// ============================================================

#define RFID_DEBOUNCE_MS             2500UL
#define QUEUE_SYNC_INTERVAL_MS       3000UL
#define HEARTBEAT_INTERVAL_MS      120000UL
#define WIFI_RECONNECT_INTERVAL_MS  10000UL
#define CLOCK_RESYNC_INTERVAL_MS  21600000UL   // 6 hours
#define HTTP_TIMEOUT_MS             15000UL
#define RFID_FRAME_GAP_MS              50UL
#define RFID_RAW_DUPLICATE_MS         1500UL
#define RFID_EVENT_QUEUE_SIZE           24

// Queue is primarily for connectivity outages.
// Failed scans are persisted in NVS.
#define MAX_QUEUE 80

// ============================================================
//                          OLED
// ============================================================

#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT   64
#define OLED_ADDRESS  0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
bool oledReady = false;

// ============================================================
//                    GLOBAL OBJECTS / STATE
// ============================================================

HardwareSerial em18(2);
WiFiClientSecure secureClient;
WebServer server(80);
DNSServer dnsServer;
Preferences prefs;

const byte DNS_PORT = 53;

String macAddr = "";
String compactMac = "";
String deviceSecret = "";

bool registered = false;
bool clockReady = false;

String lastUid = "";
unsigned long lastScanAt = 0;

unsigned long lastQueueSyncAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastWifiReconnectAt = 0;
unsigned long lastClockSyncAt = 0;

uint32_t scanCounter = 0;

struct RfidFrame {
  char raw[13];
  uint32_t capturedAt;
};

QueueHandle_t rfidFrames = nullptr;
TaskHandle_t rfidTaskHandle = nullptr;
unsigned long idleRestoreAt = 0;

// ============================================================
//                      OFFLINE EVENT QUEUE
// ============================================================

struct ScanEvent {
  char eventId[64];
  char rfidUid[16];
  char scannedAt[32];  // ISO-8601, e.g. 2026-07-30T10:31:14+05:30
};

ScanEvent queueSlots[MAX_QUEUE];

int queueHead = 0;
int queueTail = 0;
int queueCount = 0;

// ============================================================
//                         UTILITIES
// ============================================================

String truncateText(const String &s, size_t maxLen) {
  if (s.length() <= maxLen) return s;
  if (maxLen < 2) return s.substring(0, maxLen);
  return s.substring(0, maxLen - 1) + ".";
}

String macWithoutColons(String mac) {
  mac.replace(":", "");
  mac.toUpperCase();
  return mac;
}

String queueKey(int slot) {
  char key[8];
  snprintf(key, sizeof(key), "q%02d", slot);
  return String(key);
}

void ledPulse(unsigned long ms = 80) {
  digitalWrite(LED_PIN, HIGH);
  delay(ms);
  digitalWrite(LED_PIN, LOW);
}

// ============================================================
//                           OLED
// ============================================================

void showScreen(const String &title,
                const String &line1 = "",
                const String &line2 = "",
                const String &line3 = "") {
  Serial.println();
  Serial.println("[" + title + "]");
  if (line1.length()) Serial.println(line1);
  if (line2.length()) Serial.println(line2);
  if (line3.length()) Serial.println(line3);

  if (!oledReady) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(truncateText(title, 20));
  display.drawLine(0, 12, SCREEN_WIDTH - 1, 12, SSD1306_WHITE);

  display.setCursor(0, 18);
  if (line1.length()) display.println(truncateText(line1, 20));

  display.setCursor(0, 32);
  if (line2.length()) display.println(truncateText(line2, 20));

  display.setCursor(0, 46);
  if (line3.length()) display.println(truncateText(line3, 20));

  display.display();
}

void showIdle() {
  String wifiLine = (WiFi.status() == WL_CONNECTED)
                      ? "WiFi: connected"
                      : "WiFi: offline";

  String queueLine = "Queued: " + String(queueCount);

  showScreen("VIPS LIBRARY", "Scan student card", wifiLine, queueLine);
}

void initOLED() {
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  Wire.setClock(100000);
  delay(200);

  for (int i = 0; i < 3; i++) {
    if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
      oledReady = true;
      break;
    }
    delay(400);
  }

  if (!oledReady) {
    Serial.println("OLED unavailable. Continuing without display.");
    return;
  }

  showScreen("VIPS LIBRARY", "Booting...");
  delay(700);
}

// ============================================================
//                         HTTPS
// ============================================================

bool beginHttp(HTTPClient &http, const String &url) {
  /*
    PROTOTYPE NOTE:
    setInsecure() disables TLS certificate verification.
    Replace this with a trusted CA certificate before final production rollout.
  */
  secureClient.setInsecure();
  secureClient.setTimeout(HTTP_TIMEOUT_MS);

  if (!http.begin(secureClient, url)) {
    return false;
  }

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);
  return true;
}

// ============================================================
//                         WIFI
// ============================================================

void saveWiFiCredentials(const String &ssid, const String &password) {
  prefs.begin("wifi", false);
  prefs.putString("ssid", ssid);
  prefs.putString("password", password);
  prefs.end();
}

void loadWiFiCredentials(String &ssid, String &password) {
  prefs.begin("wifi", true);
  ssid = prefs.getString("ssid", "");
  password = prefs.getString("password", "");
  prefs.end();
}

void startConfigPortal() {
  WiFi.disconnect(true);
  delay(300);
  WiFi.mode(WIFI_AP);

  IPAddress apIP(192, 168, 4, 1);
  IPAddress subnet(255, 255, 255, 0);
  WiFi.softAPConfig(apIP, apIP, subnet);

  String suffix = compactMac.length() >= 6
                    ? compactMac.substring(compactMac.length() - 6)
                    : "SETUP";

  String apName = "VIPS_LIBRARY_" + suffix;

  bool apOk = WiFi.softAP(apName.c_str(), SETUP_AP_PASSWORD);

  Serial.println("Setup AP: " + apName);
  Serial.println("AP started: " + String(apOk ? "YES" : "NO"));
  Serial.println("Open: http://192.168.4.1");

  dnsServer.start(DNS_PORT, "*", apIP);

  showScreen("WIFI SETUP", apName, "192.168.4.1", "Pwd: " SETUP_AP_PASSWORD);

  server.on("/", [apName]() {
    String html =
      "<!doctype html><html><head>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>VIPS Library Setup</title>"
      "<style>"
      "body{font-family:Arial,sans-serif;background:#111;color:#eee;padding:24px}"
      ".box{max-width:380px;margin:auto;background:#1d1d1d;padding:22px;border-radius:14px}"
      "input{width:100%;box-sizing:border-box;padding:12px;margin:8px 0;border-radius:8px;border:1px solid #555}"
      "button{width:100%;padding:12px;margin-top:10px;border:0;border-radius:8px;background:#fff;color:#111;font-weight:700}"
      "small{color:#aaa}"
      "</style></head><body><div class='box'>"
      "<h2>VIPS Library RFID</h2>"
      "<p>Configure the 2.4 GHz Wi-Fi used by this reader.</p>"
      "<form method='POST' action='/save'>"
      "<input name='ssid' placeholder='Wi-Fi SSID' required>"
      "<input name='password' type='password' placeholder='Wi-Fi Password'>"
      "<button type='submit'>Save & Restart</button>"
      "</form><p><small>Device AP: " + apName + "</small></p>"
      "</div></body></html>";

    server.send(200, "text/html", html);
  });

  server.on("/save", []() {
    String ssid = server.arg("ssid");
    String password = server.arg("password");

    if (ssid.length() == 0) {
      server.send(400, "text/plain", "SSID is required.");
      return;
    }

    saveWiFiCredentials(ssid, password);
    server.send(200, "text/html",
                "<h2>Saved.</h2><p>The RFID reader is restarting...</p>");
    delay(1000);
    ESP.restart();
  });

  server.onNotFound([]() {
    server.sendHeader("Location", "http://192.168.4.1/", true);
    server.send(302, "text/plain", "");
  });

  server.begin();

  while (true) {
    dnsServer.processNextRequest();
    server.handleClient();
    delay(5);
  }
}

bool connectWiFi() {
  String ssid;
  String password;
  loadWiFiCredentials(ssid, password);

  if (ssid.length() == 0) {
    startConfigPortal();
    return false;
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(ssid.c_str(), password.c_str());

  showScreen("WIFI", "Connecting...", ssid);

  unsigned long startedAt = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - startedAt < 30000UL) {
    delay(250);
  }

  if (WiFi.status() != WL_CONNECTED) {
    showScreen("WIFI", "Connection failed", "Opening setup");
    delay(1000);
    startConfigPortal();
    return false;
  }

  Serial.println("WiFi connected");
  Serial.println("IP: " + WiFi.localIP().toString());
  Serial.println("RSSI: " + String(WiFi.RSSI()));

  showScreen("WIFI", "Connected", WiFi.localIP().toString());
  delay(500);
  return true;
}

void handleWiFiReconnect() {
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();

  if (now - lastWifiReconnectAt >= WIFI_RECONNECT_INTERVAL_MS) {
    lastWifiReconnectAt = now;
    Serial.println("WiFi offline. Reconnecting...");
    WiFi.reconnect();
  }
}

// ============================================================
//                          CLOCK
// ============================================================

bool hasValidClock() {
  time_t now = time(nullptr);

  // Any current date is safely above this threshold.
  return now > 1700000000;
}

bool syncClockFromNTP(unsigned long waitMs = 8000UL) {
  if (WiFi.status() != WL_CONNECTED) return false;

  configTime(
    GMT_OFFSET_SEC,
    DAYLIGHT_OFFSET_SEC,
    "pool.ntp.org",
    "time.google.com",
    "time.cloudflare.com"
  );

  unsigned long startedAt = millis();

  while (!hasValidClock() && millis() - startedAt < waitMs) {
    delay(200);
  }

  return hasValidClock();
}

bool syncClockFromBackend() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;

  if (!beginHttp(http, String(BACKEND_URL) + "/api/device/time")) {
    return false;
  }

  int code = http.GET();
  String response = http.getString();
  http.end();

  if (code != 200) return false;

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, response)) return false;

  long long unixSeconds = doc["unixSeconds"] | 0LL;

  if (unixSeconds < 1700000000LL) {
    return false;
  }

  struct timeval tv;
  tv.tv_sec = (time_t)unixSeconds;
  tv.tv_usec = 0;

  settimeofday(&tv, nullptr);
  return hasValidClock();
}

bool syncClock() {
  if (WiFi.status() != WL_CONNECTED) {
    clockReady = hasValidClock();
    return clockReady;
  }

  showScreen("CLOCK", "Synchronizing...");

  bool ok = syncClockFromNTP();

  if (!ok) {
    Serial.println("NTP failed; trying backend time.");
    ok = syncClockFromBackend();
  }

  clockReady = ok;

  if (ok) {
    lastClockSyncAt = millis();
    showScreen("CLOCK", "Time synchronized");
  } else {
    showScreen("CLOCK ERROR", "No trusted time", "Scans disabled");
  }

  delay(400);
  return ok;
}

String isoTimestampNow() {
  if (!hasValidClock()) return "";

  time_t now = time(nullptr);
  struct tm timeInfo;
  localtime_r(&now, &timeInfo);

  char datePart[24];
  strftime(datePart, sizeof(datePart), "%Y-%m-%dT%H:%M:%S", &timeInfo);

  return String(datePart) + "+05:30";
}

String displayTimeFromIso(const String &iso) {
  if (iso.length() >= 19) {
    String hhmmss = iso.substring(11, 19);
    return hhmmss;
  }
  return iso;
}

// ============================================================
//                    DEVICE REGISTRATION
// ============================================================

void loadDeviceSecret() {
  prefs.begin("device", true);
  deviceSecret = prefs.getString("secret", "");
  prefs.end();

  registered = deviceSecret.length() > 0;
}

void saveDeviceSecret(const String &secret) {
  prefs.begin("device", false);
  prefs.putString("secret", secret);
  prefs.end();

  deviceSecret = secret;
  registered = secret.length() > 0;
}

bool registerDevice() {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;

  if (!beginHttp(http, String(BACKEND_URL) + "/api/device/register")) {
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-enrollment-key", ENROLLMENT_KEY);

  StaticJsonDocument<512> doc;
  doc["macAddress"] = macAddr;
  doc["name"] = DEVICE_NAME;
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["deviceType"] = "LIBRARY_GATE";

  String body;
  serializeJson(doc, body);

  showScreen("DEVICE", "Registering...");

  int code = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.println("Register code: " + String(code));
  Serial.println(response);

  if (code != 200 && code != 201) {
    showScreen("DEVICE ERROR", "Registration failed", "HTTP " + String(code));
    return false;
  }

  StaticJsonDocument<768> res;
  if (deserializeJson(res, response)) {
    showScreen("DEVICE ERROR", "Bad response JSON");
    return false;
  }

  String secret = res["secret"].as<String>();

  if (secret.length() < 16) {
    showScreen("DEVICE ERROR", "No device secret");
    return false;
  }

  saveDeviceSecret(secret);

  showScreen("DEVICE", "Registered");
  delay(500);
  return true;
}

// ============================================================
//                         HEARTBEAT
// ============================================================

void sendHeartbeat() {
  if (!registered || WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;

  if (!beginHttp(http, String(BACKEND_URL) + "/api/device/heartbeat")) {
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-mac", macAddr);
  http.addHeader("x-device-secret", deviceSecret);

  StaticJsonDocument<384> doc;
  doc["firmwareVersion"] = FIRMWARE_VERSION;
  doc["deviceType"] = "LIBRARY_GATE";
  doc["queueDepth"] = queueCount;
  doc["rssi"] = WiFi.RSSI();
  doc["clockReady"] = hasValidClock();

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  Serial.println("Heartbeat: HTTP " + String(code));
}

// ============================================================
//                     PERSISTENT QUEUE
// ============================================================

void saveQueueState() {
  prefs.begin("scanqueue", false);
  prefs.putInt("head", queueHead);
  prefs.putInt("tail", queueTail);
  prefs.putInt("count", queueCount);
  prefs.end();
}

void loadQueue() {
  prefs.begin("scanqueue", true);

  queueHead = prefs.getInt("head", 0);
  queueTail = prefs.getInt("tail", 0);
  queueCount = prefs.getInt("count", 0);

  if (queueHead < 0 || queueHead >= MAX_QUEUE ||
      queueTail < 0 || queueTail >= MAX_QUEUE ||
      queueCount < 0 || queueCount > MAX_QUEUE) {
    queueHead = 0;
    queueTail = 0;
    queueCount = 0;
    prefs.end();
    saveQueueState();
    return;
  }

  for (int i = 0; i < queueCount; i++) {
    int slot = (queueHead + i) % MAX_QUEUE;
    String key = queueKey(slot);

    if (prefs.getBytesLength(key.c_str()) == sizeof(ScanEvent)) {
      prefs.getBytes(key.c_str(), &queueSlots[slot], sizeof(ScanEvent));
    } else {
      // Corrupt/missing slot: safest recovery is to clear the queue metadata.
      queueHead = 0;
      queueTail = 0;
      queueCount = 0;
      break;
    }
  }

  prefs.end();

  if (queueCount == 0) {
    saveQueueState();
  }

  Serial.println("Recovered queued scans: " + String(queueCount));
}

bool enqueueEvent(const ScanEvent &event) {
  if (queueCount >= MAX_QUEUE) {
    showScreen("QUEUE FULL", "Scan NOT saved", "Contact staff");
    return false;
  }

  int slot = queueTail;
  queueSlots[slot] = event;

  prefs.begin("scanqueue", false);
  String key = queueKey(slot);
  size_t written = prefs.putBytes(key.c_str(), &queueSlots[slot], sizeof(ScanEvent));

  if (written != sizeof(ScanEvent)) {
    prefs.end();
    showScreen("STORAGE ERROR", "Scan NOT saved");
    return false;
  }

  queueTail = (queueTail + 1) % MAX_QUEUE;
  queueCount++;

  prefs.putInt("head", queueHead);
  prefs.putInt("tail", queueTail);
  prefs.putInt("count", queueCount);
  prefs.end();

  return true;
}

bool peekEvent(ScanEvent &event) {
  if (queueCount <= 0) return false;

  event = queueSlots[queueHead];
  return true;
}

void dequeueEvent() {
  if (queueCount <= 0) return;

  int oldHead = queueHead;

  queueHead = (queueHead + 1) % MAX_QUEUE;
  queueCount--;

  if (queueCount == 0) {
    queueTail = queueHead;
  }

  prefs.begin("scanqueue", false);
  String key = queueKey(oldHead);
  prefs.remove(key.c_str());
  prefs.putInt("head", queueHead);
  prefs.putInt("tail", queueTail);
  prefs.putInt("count", queueCount);
  prefs.end();

  memset(&queueSlots[oldHead], 0, sizeof(ScanEvent));
}

// ============================================================
//                         RFID
// ============================================================

bool validateEm18Frame(const char frame[12]) {
  uint8_t checksum = 0;

  for (int i = 0; i < 12; i++) {
    if (!isHexadecimalDigit(frame[i])) return false;
  }

  // EM-18: first 10 hex characters are card data, final two are XOR checksum.
  for (int i = 0; i < 10; i += 2) {
    char pair[3] = {frame[i], frame[i + 1], '\0'};
    checksum ^= (uint8_t)strtoul(pair, nullptr, 16);
  }

  char expected[3] = {frame[10], frame[11], '\0'};
  return checksum == (uint8_t)strtoul(expected, nullptr, 16);
}

void rfidReaderTask(void *parameter) {
  char frame[12];
  uint8_t frameLength = 0;
  uint32_t lastByteAt = 0;
  char lastQueuedRaw[13] = {0};
  uint32_t lastQueuedAt = 0;

  for (;;) {
    while (em18.available() > 0) {
      int value = em18.read();
      if (value < 0) break;

      char c = (char)value;
      uint32_t now = millis();

      if (frameLength > 0 && now - lastByteAt > RFID_FRAME_GAP_MS) {
        frameLength = 0;
      }
      lastByteAt = now;

      // EM-18 variants may include STX, ETX, CR or LF. Only retain hex data.
      if (c == 0x02) {
        frameLength = 0;
        continue;
      }
      if (!isHexadecimalDigit(c)) {
        if (c == 0x03 || c == '\r' || c == '\n') frameLength = 0;
        continue;
      }

      frame[frameLength++] = (char)toupper((unsigned char)c);

      if (frameLength == 12) {
        RfidFrame event{};
        memcpy(event.raw, frame, 12);
        event.raw[12] = '\0';
        event.capturedAt = now;

        if (validateEm18Frame(frame)) {
          bool duplicateRaw = strcmp(event.raw, lastQueuedRaw) == 0 &&
                              now - lastQueuedAt < RFID_RAW_DUPLICATE_MS;
          if (!duplicateRaw) {
            if (xQueueSend(rfidFrames, &event, 0) == pdTRUE) {
              memcpy(lastQueuedRaw, event.raw, sizeof(lastQueuedRaw));
              lastQueuedAt = now;
              Serial.println("RFID captured: " + String(event.raw));
            } else {
              Serial.println("RFID queue full; frame dropped");
            }
          }
        } else {
          Serial.println("RFID checksum rejected: " + String(event.raw));
        }

        frameLength = 0;
      }
    }

    // 1 ms polling keeps UART responsive without monopolizing the core.
    vTaskDelay(pdMS_TO_TICKS(1));
  }
}

/*
  This conversion intentionally matches the existing VIPS card format:
  use characters 4..9 of the 12-byte EM-18 string as hexadecimal and
  convert that portion to the decimal identifier already used by the college.
*/
long em18ToCollegeDecimal(const String &uid) {
  if (uid.length() != 12) return -1;

  String hexPart = uid.substring(4, 10);

  for (int i = 0; i < (int)hexPart.length(); i++) {
    if (!isHexadecimalDigit(hexPart.charAt(i))) {
      return -1;
    }
  }

  long decimal = strtol(hexPart.c_str(), nullptr, 16);

  if (decimal <= 0) return -1;
  return decimal;
}

// ============================================================
//                   SCAN EVENT GENERATION
// ============================================================

bool buildScanEvent(const String &rfidUid, ScanEvent &event) {
  String timestamp = isoTimestampNow();

  if (timestamp.length() == 0) {
    return false;
  }

  scanCounter++;

  uint32_t randomPart = esp_random();

  String eventId =
    compactMac + "-" +
    String((unsigned long)time(nullptr)) + "-" +
    String(scanCounter) + "-" +
    String(randomPart, HEX);

  memset(&event, 0, sizeof(event));

  eventId.toCharArray(event.eventId, sizeof(event.eventId));
  rfidUid.toCharArray(event.rfidUid, sizeof(event.rfidUid));
  timestamp.toCharArray(event.scannedAt, sizeof(event.scannedAt));

  return true;
}

// ============================================================
//                      SCAN API
// ============================================================

enum SendResult : uint8_t {
  SEND_PROCESSED,
  SEND_RETRY_LATER,
  SEND_REJECTED
};

// Explicit prototype required for the Arduino 1.8.x sketch preprocessor.
// Without it, Arduino may auto-generate this prototype before SendResult
// has been declared, producing: 'SendResult' does not name a type.
SendResult sendScanEvent(const ScanEvent &event, bool showUi);

void showProcessedResult(const String &direction,
                         const String &studentName,
                         const String &timestamp) {
  String name = studentName.length() ? studentName : "Student";
  String timeLine = displayTimeFromIso(timestamp);

  if (direction == "IN") {
    showScreen("ENTRY RECORDED", name, timeLine, "Welcome");
  } else if (direction == "OUT") {
    showScreen("EXIT RECORDED", name, timeLine, "Thank you");
  } else {
    showScreen("SCAN RECORDED", name, timeLine);
  }

  ledPulse(120);
}

SendResult sendScanEvent(const ScanEvent &event, bool showUi) {
  if (!registered || WiFi.status() != WL_CONNECTED) {
    return SEND_RETRY_LATER;
  }

  HTTPClient http;

  if (!beginHttp(http, String(BACKEND_URL) + "/api/library/scan")) {
    return SEND_RETRY_LATER;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-mac", macAddr);
  http.addHeader("x-device-secret", deviceSecret);
  http.addHeader("x-idempotency-key", String(event.eventId));

  StaticJsonDocument<640> doc;
  doc["eventId"] = event.eventId;
  doc["rfidUid"] = event.rfidUid;
  doc["scannedAt"] = event.scannedAt;
  doc["firmwareVersion"] = FIRMWARE_VERSION;

  String body;
  serializeJson(doc, body);

  if (showUi) {
    showScreen("CHECKING", "Please wait...");
  }

  int code = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.println("Scan HTTP " + String(code));
  Serial.println(response);

  // Network errors, rate limiting, and server errors should be retried
  // with the SAME eventId.
  if (code < 0 || code == 408 || code == 425 || code == 429 || code >= 500) {
    if (showUi) {
      showScreen("OFFLINE SAVE", "Network/server issue", "Saving scan...");
    }
    return SEND_RETRY_LATER;
  }

  // Authentication failure should not be silently dropped.
  if (code == 401) {
    if (showUi) {
      showScreen("DEVICE AUTH", "Reader not authorized", "Contact admin");
    }
    return SEND_RETRY_LATER;
  }

  // The server should return useful JSON for both accepted and rejected scans.
  StaticJsonDocument<1024> res;
  bool jsonOk = !deserializeJson(res, response);

  if (code == 200 || code == 201) {
    if (!jsonOk) {
      // The server may have committed the event but the response is malformed.
      // Retry with the same eventId; backend idempotency prevents double-toggle.
      return SEND_RETRY_LATER;
    }

    String direction = res["direction"].as<String>();
    String studentName = res["student"]["name"].as<String>();

    if (studentName.length() == 0) {
      studentName = res["studentName"].as<String>();
    }

    String effectiveAt = res["scannedAt"].as<String>();
    if (effectiveAt.length() == 0) {
      effectiveAt = event.scannedAt;
    }

    if (showUi) {
      showProcessedResult(direction, studentName, effectiveAt);
    }

    return SEND_PROCESSED;
  }

  // Expected permanent rejections: invalid card, outside hours, disabled card, etc.
  // These should NOT remain in the retry queue forever.
  if (jsonOk) {
    String errorCode = res["code"].as<String>();
    String message = res["message"].as<String>();

    if (showUi) {
      if (errorCode == "LIBRARY_CLOSED") {
        showScreen("LIBRARY CLOSED", message.length() ? message : "Hours: 9 AM - 6 PM");
      } else if (errorCode == "CARD_NOT_FOUND") {
        showScreen("UNKNOWN CARD", "Not registered");
      } else if (errorCode == "DUPLICATE_SCAN") {
        showScreen("ALREADY SCANNED", "Please wait a moment");
      } else {
        showScreen("SCAN REJECTED",
                   message.length() ? message : ("HTTP " + String(code)));
      }
    }
  } else if (showUi) {
    showScreen("SCAN REJECTED", "HTTP " + String(code));
  }

  return SEND_REJECTED;
}

// ============================================================
//                       QUEUE SYNC
// ============================================================

void syncQueue() {
  if (queueCount <= 0) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (!registered) return;

  ScanEvent event;

  if (!peekEvent(event)) return;

  SendResult result = sendScanEvent(event, false);

  if (result == SEND_PROCESSED || result == SEND_REJECTED) {
    dequeueEvent();
    Serial.println("Queued event resolved. Remaining: " + String(queueCount));
  }

  // SEND_RETRY_LATER keeps the event at the head of the queue.
}

// ============================================================
//                       SCAN HANDLER
// ============================================================

void handleRFIDScan() {
  if (!rfidFrames) return;

  RfidFrame captured{};
  if (xQueueReceive(rfidFrames, &captured, 0) != pdTRUE) return;

  String raw(captured.raw);
  Serial.println("Raw RFID: " + raw);

  long decimalUid = em18ToCollegeDecimal(raw);

  if (decimalUid <= 0) {
    showScreen("INVALID CARD", "Could not read UID");
    idleRestoreAt = millis() + 600UL;
    return;
  }

  String uid = String(decimalUid);

  // Local physical debounce only.
  // Backend MUST also implement cross-device duplicate protection.
  if (uid == lastUid && millis() - lastScanAt < RFID_DEBOUNCE_MS) {
    return;
  }

  lastUid = uid;
  lastScanAt = millis();

  // Confirm the physical read before timestamp validation or HTTPS begins.
  // Network processing can take several seconds; without this acknowledgement
  // a successful first tap looks like a missed card and encourages re-tapping.
  showScreen("CARD DETECTED", "UID: " + uid, "Processing...");
  ledPulse(50);

  if (!hasValidClock()) {
    showScreen("CLOCK ERROR", "Cannot timestamp scan", "Check WiFi");
    return;
  }

  ScanEvent event;

  if (!buildScanEvent(uid, event)) {
    showScreen("SCAN ERROR", "Could not build event");
    return;
  }

  if (WiFi.status() == WL_CONNECTED && registered) {
    SendResult result = sendScanEvent(event, true);

    if (result == SEND_RETRY_LATER) {
      if (enqueueEvent(event)) {
        showScreen("SCAN SAVED", "Offline queue", event.scannedAt,
                   "Queued: " + String(queueCount));
      }
    }

    // SEND_REJECTED is intentionally not queued.
  } else {
    if (enqueueEvent(event)) {
      showScreen("SCAN SAVED", "No WiFi", event.scannedAt,
                 "Queued: " + String(queueCount));
    }
  }

  idleRestoreAt = millis() + 1200UL;
}

// ============================================================
//                           SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(250);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Start the reader task before Wi-Fi/NTP/HTTPS so EM-18 reception can never
  // be starved by a slow network call.
  em18.setRxBufferSize(1024);
  em18.begin(9600, SERIAL_8N1, EM18_RX_PIN, EM18_TX_PIN);
  rfidFrames = xQueueCreate(RFID_EVENT_QUEUE_SIZE, sizeof(RfidFrame));
  if (!rfidFrames) {
    Serial.println("Fatal: unable to create RFID queue");
    ESP.restart();
  }
  xTaskCreatePinnedToCore(
    rfidReaderTask,
    "em18-reader",
    4096,
    nullptr,
    3,
    &rfidTaskHandle,
    1
  );

  initOLED();

  // Get station MAC before opening a setup AP.
  WiFi.mode(WIFI_STA);
  delay(100);

  macAddr = WiFi.macAddress();
  macAddr.toUpperCase();
  compactMac = macWithoutColons(macAddr);

  Serial.println("Device MAC: " + macAddr);

  loadQueue();

  connectWiFi();

  loadDeviceSecret();

  if (!registered) {
    registerDevice();
  }

  syncClock();

  lastHeartbeatAt = millis();
  lastQueueSyncAt = millis();
  lastWifiReconnectAt = millis();
  lastClockSyncAt = millis();

  showIdle();
}

// ============================================================
//                            LOOP
// ============================================================

void loop() {
  handleWiFiReconnect();
  handleRFIDScan();

  unsigned long now = millis();

  if (idleRestoreAt != 0 && (int32_t)(now - idleRestoreAt) >= 0) {
    idleRestoreAt = 0;
    showIdle();
  }

  if (now - lastQueueSyncAt >= QUEUE_SYNC_INTERVAL_MS) {
    lastQueueSyncAt = now;
    syncQueue();
  }

  if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatAt = now;
    sendHeartbeat();
  }

  if (now - lastClockSyncAt >= CLOCK_RESYNC_INTERVAL_MS) {
    lastClockSyncAt = now;

    if (WiFi.status() == WL_CONNECTED) {
      syncClock();
      showIdle();
    }
  }
}
