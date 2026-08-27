import { z } from "zod";

const NAME_MAX_LENGTH = 100;

export const modeNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(NAME_MAX_LENGTH, `Name cannot exceed ${NAME_MAX_LENGTH} characters.`),
});

export type ModeNameInput = z.infer<typeof modeNameSchema>;
