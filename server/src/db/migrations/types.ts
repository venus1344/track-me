import Database from 'better-sqlite3';

export type Migration = {
  name: string;
  run: (db: Database.Database) => void;
};
