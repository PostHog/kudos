// The companyProfiles domain's jobs, bus subscribers, cron jobs, Slack handlers and website routes. Only its stack fills it.
import type { Registration } from "../registration.ts";
import { keepCompanyFacesInJob } from "./storedFaces.ts";
import { syncCompanyProfilesJob } from "./sync.ts";

export const registration: Registration = { jobs: [syncCompanyProfilesJob, keepCompanyFacesInJob] };
