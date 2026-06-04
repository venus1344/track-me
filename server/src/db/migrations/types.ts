import Database from 'better-sqlite3';

export type Migration = {
  name: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
  disableForeignKeys?: boolean;
};
