// Stands in for Convex's generated data model, the same types over the fixtures' schema.
import type { DataModelFromSchemaDefinition, DocumentByName, TableNamesInDataModel } from "convex/server";
import type { GenericId } from "convex/values";
import type schema from "../schema";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames> = GenericId<TableName>;
