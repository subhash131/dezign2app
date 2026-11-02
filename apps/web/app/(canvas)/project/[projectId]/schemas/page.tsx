import { redirect } from "next/navigation";

export default async function SchemaRedirectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/project/${projectId}?view=schema`);
}
