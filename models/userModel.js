import { query, queryOne, execute } from '../db/db.js';

const parseJSONCols = (row) => {
  if (!row) return null;
  return {
    ...row,
    column_array: typeof row.column_array === 'string' ? JSON.parse(row.column_array) : (row.column_array || []),
    menu_array: typeof row.menu_array === 'string' ? JSON.parse(row.menu_array) : (row.menu_array || []),
    document_name_array: typeof row.document_name_array === 'string' ? JSON.parse(row.document_name_array) : (row.document_name_array || [])
  };
};

export const createUser = async (userData) => {
  try {
    const {
      name,
      mobile = null,
      username,
      email,
      password,
      role = 'viewer',
      column_array = [],
      menu_array = [],
      document_name_array = [],
      show_image = 'true'
    } = userData;

    if (!name || !username || !email || !password) {
      throw new Error("Missing required fields: name, username, email, or password");
    }

    const validRoles = ['super admin', 'admin', 'production', 'quality', 'viewer'];
    const assignedRole = validRoles.includes(role) ? role : 'viewer';

    const result = await execute(
      `INSERT INTO users (name, mobile, username, email, password, role, column_array, menu_array, document_name_array,  show_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        mobile,
        username,
        email,
        password, 
        assignedRole,
        JSON.stringify(column_array),
        JSON.stringify(menu_array),
        JSON.stringify(document_name_array),
        show_image
      ]
    );

    return await findUserById(result.insertId);
  } catch (error) {
    console.error("Error in createUser:", error);
    throw error;
  }
};

export const findUserByEmail = async (email) => {
  try {
    const row = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
    return parseJSONCols(row);
  } catch (error) {
    console.error("Error in findUserByEmail:", error);
    throw error;
  }
};

export const findUserByUsername = async (username) => {
  try {
    const row = await queryOne('SELECT * FROM users WHERE username = ?', [username]);
    return parseJSONCols(row);
  } catch (error) {
    console.error("Error in findUserByUsername:", error);
    throw error;
  }
};

export const findUserById = async (id) => {
  try {
    const row = await queryOne('SELECT * FROM users WHERE id = ?', [id]);
    return parseJSONCols(row);
  } catch (error) {
    console.error("Error in findUserById:", error);
    throw error;
  }
};

export const updateUserImage = async (id, imagePath) => {
  try {
    await execute('UPDATE users SET profile_image = ? WHERE id = ?', [imagePath, id]);
    return await findUserById(id);
  } catch (error) {
    console.error("Error in updateUserImage:", error);
    throw error;
  }
};

export const updateUser = async (id, updateData) => {
    try {
const allowedFields = [
  'name',
  'mobile',
  'role',
  'email',
  'username',
  'password',
  'show_image',
  'column_array',
  'menu_array',
  'document_name_array',
  'is_active'
  
];        let fields = [];
        let values = [];

        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined && allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(updateData[key]);
            }
        });

        if (updateData.column_array !== undefined) {
             fields.push('column_array = ?');
             values.push(JSON.stringify(updateData.column_array));
        }

        if (updateData.menu_array !== undefined) {
            fields.push('menu_array = ?');
            values.push(JSON.stringify(updateData.menu_array));
        }

        if (updateData.document_name_array !== undefined) {
            fields.push('document_name_array = ?');
            values.push(JSON.stringify(updateData.document_name_array));
        }

        if(updateData.is_active !== undefined) {
            fields.push('is_active = ?');
            values.push(updateData.is_active ? 1 : 0);
        }

        if (updateData.mail_types !== undefined) {
  const valid = ['shift_scan_report', 'day_scan_report', 'monthly_scan_report', 'monthly_product_report'];
  if (!Array.isArray(updateData.mail_types)) {
    throw new Error('mail_types must be an array');
  }
  const invalid = updateData.mail_types.filter(t => !valid.includes(t));
  if (invalid.length) {
    throw new Error(`Invalid mail type(s): ${invalid.join(', ')}`);
  }
  fields.push('mail_types = ?');
  values.push(JSON.stringify(updateData.mail_types));
}

        if (fields.length === 0) return await findUserById(id);

        values.push(id);
        const queryStr = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
        await execute(queryStr, values);

        return await findUserById(id);
    } catch(err) {
        console.error("Error in updateUser:", err);
        throw err;
    }
}

export const findAllUsers = async () => {
  try {
    const rows = await query('SELECT * FROM users ORDER BY created_at DESC');
    // Ensure rows is an array even if empty
    if (!rows || !Array.isArray(rows)) return [];
    return rows.map(parseJSONCols);
  } catch (error) {
    console.error("Error in findAllUsers:", error);
    throw error;
  }
};

export const deleteUserById = async (id) => {
  try {
    await execute('DELETE FROM users WHERE id = ?', [id]);
    return true;
  } catch (error) {
    console.error("Error in deleteUserById:", error);
    throw error;
  }
};

export const findEmailsByRoles = async (roles) => {
  try {
    if (!roles || roles.length === 0) return [];
    const placeholders = roles.map(() => '?').join(',');
    const rows = await query(`SELECT email FROM users WHERE role IN (${placeholders})`, roles);
    return rows.map(r => r.email).filter(e => e);
  } catch (error) {
    console.error("Error in findEmailsByRoles:", error);
    throw error;
  }
};



export const MAIL_TYPES = [
  'shift_scan_report',    // shift-wise all scan report + statistics
  'day_scan_report',    // day-wise report per part number
  'monthly_scan_report',  // monthly scan report
  'monthly_product_report', // monthly products report
];

/**
 * Adds one or more mail types to a user.
 * Silently skips types the user already has (idempotent).
 *
 * @returns {Object} updated user row
 */
export const addMailTypes = async (userId, mailTypes) => {
  try {
    if (!Array.isArray(mailTypes) || mailTypes.length === 0) {
      throw new Error('mailTypes must be a non-empty array');
    }
    const invalid = mailTypes.filter(t => !MAIL_TYPES.includes(t));
    if (invalid.length) throw new Error(`Invalid mail type(s): ${invalid.join(', ')}`);

    const user = await findUserById(userId);
    if (!user) return null;

    const current = Array.isArray(user.mail_types) ? user.mail_types : [];
    const merged  = [...new Set([...current, ...mailTypes])]; // deduplicates

    await execute(
      'UPDATE users SET mail_types = ? WHERE id = ?',
      [JSON.stringify(merged), userId]
    );

    return await findUserById(userId);
  } catch (err) {
    console.error('Error in addMailTypes:', err);
    throw err;
  }
};

/**
 * Removes one or more mail types from a user.
 * Passing an empty array clears all mail types.
 *
 * @returns {Object} updated user row
 */
export const removeMailTypes = async (userId, mailTypes) => {
  try {
    if (!Array.isArray(mailTypes)) {
      throw new Error('mailTypes must be an array');
    }

    const user = await findUserById(userId);
    if (!user) return null;

    const current = Array.isArray(user.mail_types) ? user.mail_types : [];

    // Empty array = clear all
    const updated = mailTypes.length === 0
      ? []
      : current.filter(t => !mailTypes.includes(t));

    await execute(
      'UPDATE users SET mail_types = ? WHERE id = ?',
      [JSON.stringify(updated), userId]
    );

    return await findUserById(userId);
  } catch (err) {
    console.error('Error in removeMailTypes:', err);
    throw err;
  }
};
