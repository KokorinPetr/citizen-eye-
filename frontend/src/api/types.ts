/** Friendly names for generated API types (src/api/schema.d.ts). */
import type { components } from "./schema";

type Schemas = components["schemas"];

export type User = Schemas["UserRead"];
export type UserPublic = Schemas["UserPublic"];
export type AuthResponse = Schemas["AuthResponse"];

export type IncidentMapItem = Schemas["IncidentMapItem"];
export type Incident = Schemas["IncidentRead"];
export type IncidentReport = Schemas["IncidentReportRead"];
export type Task = Schemas["TaskRead"];
export type Volunteer = Schemas["VolunteerRead"];
export type NeedType = Schemas["NeedType"];
export type Urgency = Schemas["Urgency"];
export type IncidentStatus = Schemas["IncidentStatus"];
export type TaskRole = Schemas["TaskRole"];
export type AreaAlert = Schemas["AreaAlert"];

export type Center = Schemas["CenterRead"];
export type CenterNearby = Schemas["CenterNearby"];
export type CenterType = Schemas["CenterType"];
export type NearestRoutes = Schemas["NearestRoutes"];

export type Post = Schemas["PostRead"];
export type PostCategory = Schemas["PostCategory"];

export type GeoPoint = Schemas["GeoPoint"];

export type ParsedReport = Schemas["ParsedReport"];
export type ReportResult = Schemas["ReportResult"];
export type CenterCreate = Schemas["CenterCreate"];
