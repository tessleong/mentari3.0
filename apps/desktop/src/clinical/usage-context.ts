import { DOCTORS_VISIT_TEMPLATE_ID } from "./summary-evidence";

import { useSession } from "~/session/queries";
import { useConfigValue } from "~/shared/config";

export const PATIENT_USAGE_CONTEXT = "patient";

// A user is in "patient context" either globally (chose it during
// onboarding) or locally for one note (picked the Doctor's Visit template).
// Either signal is enough — someone who only occasionally uses that
// template shouldn't have to commit to a global mode to get relevant copy.
export function useIsPatientContext(sessionId: string | undefined): boolean {
  const usageContext = useConfigValue("usage_context");
  const session = useSession(sessionId ?? "");
  return (
    usageContext === PATIENT_USAGE_CONTEXT ||
    session?.raw_template_id === DOCTORS_VISIT_TEMPLATE_ID
  );
}
