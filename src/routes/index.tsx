import { createFileRoute } from "@tanstack/react-router";
import { CraneYard } from "@/game/CraneYard";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <CraneYard />;
}
