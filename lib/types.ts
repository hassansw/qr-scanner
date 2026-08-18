export type ScanStatus =
  /** No camera stream yet. */
  | "idle"
  /** Live preview, detection loop running. */
  | "scanning"
  /** Code found; camera shutting down and the register page opening. */
  | "detected"
  /** Decoding an uploaded image. */
  | "processing";

export type ScanResult = {
  code: string;
  status: "success" | "error";
  timestamp: number;
  message: string;
  payload?: VisitorFormData;
};

export type ScanApiResponse = {
  ok: boolean;
  status: number;
  data: unknown;
};

export type VisitorFormData = {
  name: string;
  email: string;
  phone: string;
  visitortype: string;
  is_existing: boolean;
  company_name: string;
  website?: string;
  session_uuid: string;
};
