export type ScanStatus = "idle" | "scanning" | "form" | "success" | "error";

export type ScanResult = {
  code: string;
  status: "success" | "error";
  timestamp: number;
  message: string;
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