// The analytics domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { drain } from "./outbox.ts";
import { flagsRefresh } from "./refresh.ts";

export const registration: Registration = { jobs: [flagsRefresh, drain] };
