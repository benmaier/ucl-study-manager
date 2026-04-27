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
        // `stages.files` (StageFile rows) intentionally not included — no
        // /study or auth caller reads it; file metadata lives in
        // stage.config already. Dropping the join saves a lot of bytes
        // when stages have files attached.
        include: {
          stages: { orderBy: { order: "asc" } },
        },
      },
      session: { include: { study: true } },
      progress: true,
    },
  });
}
