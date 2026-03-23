import { cookies } from "next/headers";
import { prisma } from "./prisma";

export async function getParticipant() {
  const cookieStore = await cookies();
  const pid = cookieStore.get("participant_id")?.value;
  if (!pid) return null;

  return prisma.participant.findUnique({
    where: { id: parseInt(pid, 10) },
    include: {
      cohort: {
        include: {
          stages: { include: { files: true }, orderBy: { order: "asc" } },
        },
      },
      session: { include: { study: true } },
      progress: true,
    },
  });
}
