// controllers/staff.controller.js
import prisma from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import { parseDateInput } from '../utils/date.js';

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
    
    res.json({ data: staff });
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
    
    res.json({ data: staff });
  },

  // Create a staff member
  create: async (req, res) => {
    try {
      const { 
        name, 
        email, 
        password, 
        roleIds, 
        employeeCode,
        designation,
        department,
        dateOfJoining,
        ...rest 
      } = req.body;
      
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
        ...rest,
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
        // Verify roles exist
        const roles = await prisma.role.findMany({
          where: {
            id: { in: roleIds }
          }
        });
        
        if (roles.length !== roleIds.length) {
          return res.status(400).json({ 
            error: 'One or more roles not found' 
          });
        }
        
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
        email, 
        password, 
        roleIds,
        employeeCode,
        designation,
        department,
        dateOfJoining,
        isActive,
        ...rest 
      } = req.body;
      
      // First check if staff exists
      const existingStaff = await prisma.staff.findUnique({
        where: { id: req.params.id },
        include: { user: true }
      });
      
      if (!existingStaff) {
        return res.status(404).json({ error: 'Staff member not found' });
      }
      
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
        isActive: isActive !== undefined ? isActive : existingStaff.user.isActive,
        ...rest
      };
      
      // Update password if provided
      if (password) {
        const saltRounds = 10;
        userUpdateData.passwordHash = await bcrypt.hash(password, saltRounds);
      }
      
      // Handle role updates if provided
      if (roleIds && Array.isArray(roleIds)) {
        // Verify roles exist
        if (roleIds.length > 0) {
          const roles = await prisma.role.findMany({
            where: {
              id: { in: roleIds }
            }
          });
          
          if (roles.length !== roleIds.length) {
            return res.status(400).json({ 
              error: 'One or more roles not found' 
            });
          }
        }
        
        userUpdateData.userRoles = {
          deleteMany: {}, // Remove all existing roles
          create: roleIds.map(roleId => ({
            role: {
              connect: { id: roleId }
            }
          }))
        };
      }
      
      // Update user
      await prisma.user.update({
        where: { id: existingStaff.userId },
        data: userUpdateData
      });

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
      
      res.json({ data: staff });
    } catch (error) {
      console.error('Error fetching staff by user ID:', error);
      res.status(500).json({ 
        error: 'Failed to fetch staff member',
        details: error.message 
      });
    }
  }
};