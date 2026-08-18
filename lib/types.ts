export type ScanStatus = "idle" | "scanning";

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
