export type PersonnelRank = "cp" | "dcp" | "acp" | "si" | "ci" | "inspector";

export const RANK_LABEL: Record<PersonnelRank, string> = {
  cp: "Commissioner of Police",
  dcp: "Deputy Commissioner of Police",
  acp: "Assistant Commissioner of Police",
  si: "Sub-Inspector",
  ci: "Circle Inspector",
  inspector: "Police Inspector",
};

export interface EmployeeUser {
  id: string; code: string; name: string; phone: string; role: "employee";
  designation: string | null; profilePhotoUrl: string | null;
  shiftSlot: "morning" | "afternoon" | "night" | null; shiftLabel: string | null; shiftTime?: string | null;
  sector?: string | null; placeOfPosting?: string | null; canRevealNextShift: boolean;
  nextShiftLabel: string | null; assignedPlace: string | null; onDuty: boolean;
  lastLocation: { lat: number; lng: number; accuracy: number | null; at: number } | null;
  lastCheckIn: { photoId: string; photoUrl: string; lat: number | null; lng: number | null; accuracy: number | null; locationVerified: boolean; locationError: string | null; at: number; employeeCode: string; employeeName: string } | null;
}

export interface PersonnelUser {
  id: string; code: string; name: string; phone: string; role: PersonnelRank;
}

export type CurrentUser = EmployeeUser | PersonnelUser;
