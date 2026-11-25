import { CONSULTATION_CALENDAR_URL } from "./const";

export type ConsultationNavigator = (url: string) => void;

export function continueToConsultationCalendar(
  navigate: ConsultationNavigator = url => window.location.assign(url)
) {
  navigate(CONSULTATION_CALENDAR_URL);
}
