// Stands in for Convex's generated data model, which the fixtures import only for its types.
export type Id<Table extends string> = string & { __tableName: Table };
export type Doc<Table extends string> = { _id: Id<Table>; _creationTime: number };
