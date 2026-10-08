import { notFound } from "next/navigation";
import { SttLab } from "./SttLab";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SttLab />;
}
