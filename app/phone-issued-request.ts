import { phoneIssuedHeader } from "./sync-model";

// The Clinic PC calls these route modules in its renderer. Production route
// requests are therefore the Cloud copy even on a wider screen; the explicit
// header keeps that path testable in development.
export function isPhoneIssuedRequest(request: Request) {
  return (
    request.headers.get(phoneIssuedHeader) === "1" ||
    (typeof window === "undefined" && process.env.NODE_ENV === "production")
  );
}
