import { redirect } from "next/navigation";

/** The build board became the Builds view of the Clients directory. Old links land on that view. */
export default function ProjectsPage(): never {
  redirect("/clients?view=builds");
}
