import { JoinScreen } from "@/components/JoinScreen";

export const metadata = { title: "Dhakerni", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinScreen code={decodeURIComponent(code)} />;
}
