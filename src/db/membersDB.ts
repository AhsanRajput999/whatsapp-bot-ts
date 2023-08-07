import { loggerBot } from "../utils/logger";
import pool from "./pool";

export const createMembersTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS members(
        memberjid TEXT PRIMARY KEY, 
        name TEXT NOT NULL, 
        donation INTEGER DEFAULT 0,
        milestones JSON
    );`
  );
};

export interface GetUsernames {
  [key: string]: string;
}

// get usesrnames
export const getUsernames = async (
  memberjidArray: string[]
): Promise<GetUsernames[]> => {
  try {
    const res = await pool.query(
      "SELECT * FROM members WHERE memberjid = ANY($1::TEXT[])",
      [memberjidArray]
    );
    if (res.rowCount) {
      return res.rows;
    }
  } catch (error) {
    await loggerBot(undefined, "[getUsernames DB]", error, { memberjidArray });
  }
  return [];
};

/* -------------------------------- DONATIONS ------------------------------- */
export interface GetDonation {
  name: string;
  memberjid: string;
  donation: number;
}

export const getDonation = async (): Promise<GetDonation[]> => {
  try {
    const res = await pool.query(
      "SELECT * FROM members WHERE donation>0 ORDER BY donation DESC;"
    );
    if (res.rowCount) {
      return res.rows;
    }
  } catch (error) {
    await loggerBot(undefined, "[getDonation DB]", error, undefined);
  }
  return [];
};

export const setDonation = async (
  memberjid: string,
  donation: number,
  number: string
): Promise<boolean> => {
  try {
    const res = await pool.query(
      "UPDATE members SET donation=$2 WHERE memberjid=$1;",
      [memberjid, donation]
    );

    // not updated
    if (res.rowCount === 0) {
      const res2 = await pool.query(
        "INSERT INTO members VALUES($1,$2,$3,$4);",
        [memberjid, number, donation, "[]"]
      );
      if (res2.rowCount === 1) return true;
      return false;
    }
    return true;
  } catch (error) {
    await loggerBot(undefined, "[setDonation DB]", error, {
      number,
      donation,
    });
    return false;
  }
};

/* -------------------------------- MILESTONE ------------------------------- */
export interface GetMilestones {
  memberjid: string;
  name: string;
  milestones?: string[];
}

export const getMilestones = async (
  memberjid: string
): Promise<GetMilestones[]> => {
  try {
    const res = await pool.query(
      "SELECT memberjid, name, milestones FROM members WHERE memberjid=$1;",
      [memberjid]
    );
    if (res.rowCount) {
      return res.rows;
    }
  } catch (error) {
    await loggerBot(undefined, "[getMilestones DB]", error, { memberjid });
  }
  return [];
};

export const setMilestones = async (
  memberjid: string,
  milestones: string[]
): Promise<boolean> => {
  try {
    const milestonesJson = JSON.stringify(milestones);
    const res = await pool.query(
      "UPDATE members SET milestones=$2 WHERE memberjid=$1;",
      [memberjid, milestonesJson]
    );

    // not updated
    if (res.rowCount === 0) {
      return false;
    }
    return true;
  } catch (error) {
    await loggerBot(undefined, "[setMilestones DB]", error, {
      memberjid,
      milestones,
    });
    return false;
  }
};
