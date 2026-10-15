// controllers/staff.controller.js
import prisma from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import { loadAssignableRoles } from '../services/access.service.js';
import { isPersonalRole } from '../permissions/resolve.js';
import ROLES from '../permissions/role.constants.js';
import { parseDateInput } from '../utils/date.js';

// Never send the password hash (or internal per-user roles) to the browser.
const safeStaff = (staff) => {
  if (!staff?.user) return staff;
  const { passwordHash: _omit, ...user } = staff.user;
  if (user.userRoles) user.userRoles = user.userRoles.filter((ur) => !isPersonalRole(ur.role));
  return { ...staff, user };
};

// A non-admin must not be able to edit / reset / deactivate an administrator
// just because that administrator also has a staff profile.
async function assertNotAdminTarget(actor, userId) {
  const isActorAdmin = actor.userRoles.some((ur) => ur.role.name === ROLES.ADMIN);
  if (isActorAdmin) return;
  const adminRole = await prisma.userRole.findFirst({
    where: { userId, role: { name: ROLES.ADMIN } },
  });
  if (adminRole) {
    const err = new Error('Only an administrator can modify an administrator account');
    err.status = 403;
    throw err;
  }
}

const normEmail = (v) => String(v || '').trim().toLowerCase();

export const staffController = {
  // List all staff members with their user details
  list: async (req, res) => {
    const staff = await prisma.staff.findMany({
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        user: {
          name: 'asc'
        }
      }
    });
    
    res.json({ data: staff.map(safeStaff) });
  },

  // Get a single staff member
  get: async (req, res) => {
    const staff = await prisma.staff.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: true
              }
            }
          }
        }
      }
    });
    
    res.json({ data: safeStaff(staff) });
  },

  // Create a staff member
  create: async (req, res) => {
    try {
      const { 
        name, 
        password, 
        roleIds, 
        employeeCode,
        designation,
        department,
        dateOfJoining
      } = req.body;
      const email = normEmail(req.body.email);
      
      // Validate required fields
      if (!name || !email || !password || !employeeCode) {
        return res.status(400).json({ 
          error: 'Name, email, password, and employee code are required' 
        });
      }
      
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });
      
      if (existingUser) {
        return res.status(400).json({ 
          error: 'User with this email already exists' 
        });
      }

      // Check if employee code already exists
      const existingStaff = await prisma.staff.findUnique({
        where: { employeeCode }
      });

      if (existingStaff) {
        return res.status(400).json({ 
          error: 'Employee code already exists' 
        });
      }
      
      // Hash the password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Prepare user creation data
      const createData = {
        name,
        email,
        passwordHash,
        isActive: true,
        staff: {
          create: {
            employeeCode,
            designation: designation || null,
            department: department || null,
            dateOfJoining: dateOfJoining ? parseDateInput(dateOfJoining, 'dateOfJoining') : null,
            isActive: true
          }
        }
      };
      
      // Handle roleIds - if provided and is an array
      if (roleIds && Array.isArray(roleIds) && roleIds.length > 0) {
        // Validates existence and blocks privilege escalation (e.g. a
        // non-admin handing out ADMIN or permissions they do not have).
        await loadAssignableRoles(req.user, roleIds);
        
        createData.userRoles = {
          create: roleIds.map(roleId => ({
            role: {
              connect: { id: roleId }
            }
          }))
        };
      } else {
        // If no roles provided, assign a default staff role
        const defaultRole = await prisma.role.findFirst({
          where: {
            name: 'STAFF'
          }
        });
        
        if (defaultRole) {
          createData.userRoles = {
            create: [{
              role: {
                connect: { id: defaultRole.id }
              }
            }]
          };
        } else {
          return res.status(400).json({ 
            error: 'No roles provided and default STAFF role not found. Please create a STAFF role first.' 
          });
        }
      }
      
      const user = await prisma.user.create({
        data: createData,
        include: {
          staff: true,
          userRoles: {
            include: {
              role: true
            }
          }
        }
      });
      
      // Remove password hash from response
      const { passwordHash: _, ...userWithoutPassword } = user;
      
      res.status(201).json({ data: userWithoutPassword });
      
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
      console.error('Error creating staff:', error);
      res.status(500).json({ 
        error: 'Failed to create staff member',
        details: error.message 
      });
    }
  },

  // Update a staff member
  update: async (req, res) => {
    try {
      const { 
        name, 
        password, 
        roleIds,
        employeeCode,
        designation,
        department,
        dateOfJoining,
        isActive
      } = req.body;
      const email = req.body.email !== undefined ? normEmail(req.body.email) : undefined;
      
      // First check if staff exists
      const existingStaff = await prisma.staff.findUnique({
        where: { id: req.params.id },
        include: { user: true }
      });
      
      if (!existingStaff) {
        return res.status(404).json({ error: 'Staff member not found' });
      }
      await assertNotAdminTarget(req.user, existingStaff.userId);
      
      // Check if email is being changed and is already taken
      if (email && email !== existingStaff.user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email }
        });
        
        if (existingUser) {
          return res.status(400).json({ 
            error: 'Email already taken by another user' 
          });
        }
      }

      // Check if employee code is being changed and is already taken
      if (employeeCode && employeeCode !== existingStaff.employeeCode) {
        const existingEmployee = await prisma.staff.findUnique({
          where: { employeeCode }
        });

        if (existingEmployee) {
          return res.status(400).json({ 
            error: 'Employee code already exists' 
          });
        }
      }
      
      // Prepare update data for user
      const userUpdateData = {
        name: name || existingStaff.user.name,
        email: email || existingStaff.user.email,
        isActive: isActive !== undefined ? isActive : existingStaff.user.isActive
      };
      
      // Update password if provided
      if (password) {
        const saltRounds = 10;
        userUpdateData.passwordHash = await bcrypt.hash(password, saltRounds);
      }
      
      // Handle role updates if provided
      let replaceRoleIds = null;
      if (roleIds && Array.isArray(roleIds)) {
        if (existingStaff.userId === req.user.id) {
          return res.status(403).json({ error: 'You cannot change your own roles' });
        }
        await loadAssignableRoles(req.user, roleIds);
        
        replaceRoleIds = roleIds;
      }
      
      // Update user
      await prisma.user.update({
        where: { id: existingStaff.userId },
        data: userUpdateData
      });

      if (replaceRoleIds) {
        // Replace shared roles; keep the user's custom-permission role (user:<id>).
        await prisma.$transaction([
          prisma.userRole.deleteMany({
            where: {
              userId: existingStaff.userId,
              role: { name: { not: { startsWith: 'user:' } } }
            }
          }),
          prisma.userRole.createMany({
            data: replaceRoleIds.map((roleId) => ({ userId: existingStaff.userId, roleId })),
            skipDuplicates: true
          })
        ]);
      }

      // Update staff
      const updatedStaff = await prisma.staff.update({
        where: { id: req.params.id },
        data: {
          employeeCode: employeeCode || existingStaff.employeeCode,
          designation: designation !== undefined ? designation : existingStaff.designation,
          department: department !== undefined ? department : existingStaff.department,
          dateOfJoining: dateOfJoining ? parseDateInput(dateOfJoining, 'dateOfJoining') : existingStaff.dateOfJoining,
          isActive: isActive !== undefined ? isActive : existingStaff.isActive
        },
        include: {
          user: {
            include: {
              userRoles: {
                include: {
                  role: true
                }
              }
            }
          }
        }
      });
      
      // Remove password hash from response
      const { passwordHash: _, ...staffWithoutPassword } = updatedStaff.user;
      const response = { ...updatedStaff, user: staffWithoutPassword };
      
      res.json({ data: response });
      
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
      console.error('Error updating staff:', error);
      res.status(500).json({ 
        error: 'Failed to update staff member',
        details: error.message 
      });
    }
  },

  // Remove/Deactivate a staff member
  remove: async (req, res) => {
    try {
      // Check if staff exists
      const existingStaff = await prisma.staff.findUnique({
        where: { id: req.params.id },
        include: { user: true }
      });
      
      if (!existingStaff) {
        return res.status(404).json({ error: 'Staff member not found' });
      }
      await assertNotAdminTarget(req.user, existingStaff.userId);
      if (existingStaff.userId === req.user.id) {
        return res.status(400).json({ error: 'You cannot deactivate your own account' });
      }
      
      // Soft delete (deactivate both staff and user)
      await prisma.$transaction([
        prisma.staff.update({
          where: { id: req.params.id },
          data: { isActive: false }
        }),
        prisma.user.update({
          where: { id: existingStaff.userId },
          data: { isActive: false }
        })
      ]);

      // Get updated staff
      const updatedStaff = await prisma.staff.findUnique({
        where: { id: req.params.id },
        include: {
          user: {
            include: {
              userRoles: {
                include: {
                  role: true
                }
              }
            }
          }
        }
      });

      // Remove password hash from response
      const { passwordHash: _, ...staffWithoutPassword } = updatedStaff.user;
      const response = { ...updatedStaff, user: staffWithoutPassword };
      
      res.json({ data: response });
      
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error('Error removing staff:', error);
      res.status(500).json({ 
        error: 'Failed to remove staff member',
        details: error.message 
      });
    }
  },

  // Get staff by user ID
  getByUserId: async (req, res) => {
    try {
      const staff = await prisma.staff.findUnique({
        where: { userId: req.params.userId },
        include: {
          user: {
            include: {
              userRoles: {
                include: {
                  role: true
                }
              }
            }
          }
        }
      });
      
      if (!staff) {
        return res.status(404).json({ error: 'Staff member not found' });
      }
      
      res.json({ data: safeStaff(staff) });
    } catch (error) {
      console.error('Error fetching staff by user ID:', error);
      res.status(500).json({ 
        error: 'Failed to fetch staff member',
        details: error.message 
      });
    }
  }
};