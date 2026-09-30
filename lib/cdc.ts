export const CDC_PROGRAMS = [
  { code: "027", label: "CSE", name: "Computer Science & Engineering" },
  { code: "116", label: "AIML", name: "Artificial Intelligence & Machine Learning" },
  { code: "117", label: "IIOT", name: "Industrial Internet of Things" },
  { code: "119", label: "AIDS", name: "Artificial Intelligence & Data Science" },
  { code: "135", label: "CYBER", name: "Computer Science - Cyber Security" },
  { code: "160", label: "VLSI", name: "VLSI Design & Technology" },
  { code: "495", label: "CSAM", name: "Computer Science & Applied Mathematics" },
] as const;

export const CDC_PROGRAM_CODES = new Set<string>(CDC_PROGRAMS.map((program) => program.code));

export function cdcProgramLabel(code: string) {
  return CDC_PROGRAMS.find((program) => program.code === code)?.label || code;
}

export function normalizeEnrollmentNumber(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits || digits.length > 11) return "";
  return digits.padStart(11, "0");
}

export function decodeEnrollmentNumber(value: string) {
  const enrollmentNumber = normalizeEnrollmentNumber(value);
  if (!enrollmentNumber) return null;
  return {
    enrollmentNumber,
    rollNumber: enrollmentNumber.slice(0, 3),
    instituteCode: enrollmentNumber.slice(3, 6),
    programCode: enrollmentNumber.slice(6, 9),
    admissionYear: 2000 + Number(enrollmentNumber.slice(9, 11)),
  };
}

export function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
}
