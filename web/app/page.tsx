import { SessionList } from "@/components/SessionList";
import { getDurableSessionDashboardSummaries } from "@/lib/sessionData";

export const dynamic = "force-dynamic";

export default async function SessionListPage() {
  return <SessionList summaries={await getDurableSessionDashboardSummaries()} />;
}
