import prisma from '../lib/prisma.js';

class StaffAssignmentService {
  /**
   * Get matrix view: all SubjectAllocations for an academic year
   * with their assigned staff (if any). Perfect for the frontend table.
   */
  async getSubjectStandardMatrix(academicYearId) {
    const allocations = await prisma.subjectAllocation.findMany({
      where: { academicYearId },
      include: {
        standard: {
          select: { id: true, code: true, name: true }
        },
        subject: {
          select: { id: true, code: true, name: true, credits: true }
        },
        staffAssignments: {
          include: {
            staff: {
              include: {
                user: {
                  select: { id: true, name: true, email: true }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { standard: { name: 'asc' } },
        { subject: { name: 'asc' } }
      ]
    });

    // Flatten for the frontend table: one row per class-subject combo
    return allocations.map(allocation => {
      const assignment = allocation.staffAssignments[0] || null; // UI shows one staff per row

      return {
        allocationId: allocation.id,
        academicYearId: allocation.academicYearId,
        standardId: allocation.standardId,
        standardName: allocation.standard.name,
        standardCode: allocation.standard.code,
        subjectId: allocation.subjectId,
        subjectName: allocation.subject.name,
        subjectCode: allocation.subject.code,
        assignmentId: assignment?.id || null,
        staffId: assignment?.staffId || null,
        staffName: assignment?.staff?.user?.name || null,
        staffEmail: assignment?.staff?.user?.email || null,
        isAssigned: !!assignment
      };
    });
  }

  /**
   * Get all raw StaffSubjectAssignments with filters
   */
  async getAllAssignments(filters = {}) {
    const { academicYearId, standardId, subjectId, staffId } = filters;

    const where = {};
    const allocationFilter = {};

    if (academicYearId) allocationFilter.academicYearId = academicYearId;
    if (standardId) allocationFilter.standardId = standardId;
    if (subjectId) allocationFilter.subjectId = subjectId;
    if (staffId) where.staffId = staffId;

    if (Object.keys(allocationFilter).length > 0) {
      where.subjectAllocation = allocationFilter;
    }

    return prisma.staffSubjectAssignment.findMany({
      where,
      include: {
        subjectAllocation: {
          include: {
            academicYear: { select: { id: true, name: true, startDate: true, endDate: true } },
            standard: { select: { id: true, code: true, name: true } },
            subject: { select: { id: true, code: true, name: true, credits: true } }
          }
        },
        staff: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      },
      orderBy: {
        subjectAllocation: {
          standard: { name: 'asc' }
        }
      }
    });
  }

  /**
   * Get single assignment by ID
   */
  async getAssignmentById(id) {
    return prisma.staffSubjectAssignment.findUniqueOrThrow({
      where: { id },
      include: {
        subjectAllocation: {
          include: {
            academicYear: { select: { id: true, name: true } },
            standard: { select: { id: true, code: true, name: true } },
            subject: { select: { id: true, code: true, name: true } }
          }
        },
        staff: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });
  }

  /**
   * Upsert assignment by combo (academicYearId + standardId + subjectId + staffId).
   * This is what the frontend matrix will call when a dropdown changes.
   * If staffId is null/empty, it unassigns.
   */
  async assignStaff(data) {
    const { academicYearId, standardId, subjectId, staffId } = data;

    return prisma.$transaction(async (tx) => {
      // 1. Find the SubjectAllocation (the "slot")
      const allocation = await tx.subjectAllocation.findUnique({
        where: {
          academicYearId_standardId_subjectId: {
            academicYearId,
            standardId,
            subjectId
          }
        }
      });

      if (!allocation) {
        throw new Error(`No subject allocation found for the given academic year, class and subject. Generate data first.`);
      }

      // 2. Remove any existing staff assignments for this slot
      //    (enforces one-staff-per-slot as shown in your UI)
      await tx.staffSubjectAssignment.deleteMany({
        where: { subjectAllocationId: allocation.id }
      });

      // 3. If staffId is empty, we're done (unassigned)
      if (!staffId) {
        return {
          subjectAllocationId: allocation.id,
          staffId: null,
          standardId,
          subjectId,
          academicYearId,
          message: 'Staff unassigned successfully'
        };
      }

      // 4. Validate staff exists
      const staff = await tx.staff.findUnique({
        where: { id: staffId },
        include: { user: { select: { name: true } } }
      });
      if (!staff) {
        throw new Error(`Staff with ID ${staffId} not found`);
      }

      // 5. Create new assignment
      const assignment = await tx.staffSubjectAssignment.create({
        data: {
          subjectAllocationId: allocation.id,
          staffId
        },
        include: {
          subjectAllocation: {
            include: {
              standard: { select: { id: true, code: true, name: true } },
              subject: { select: { id: true, code: true, name: true } },
              academicYear: { select: { id: true, name: true } }
            }
          },
          staff: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          }
        }
      });

      return assignment;
    });
  }

  /**
   * Update an existing assignment by its own ID
   */
  async updateAssignment(id, data) {
    const { staffId } = data;

    return prisma.$transaction(async (tx) => {
      const existing = await tx.staffSubjectAssignment.findUniqueOrThrow({
        where: { id },
        include: { subjectAllocation: true }
      });

      if (staffId) {
        const staff = await tx.staff.findUnique({ where: { id: staffId } });
        if (!staff) throw new Error('Staff not found');

        // Ensure no duplicate for same slot (maintain single-staff-per-slot)
        await tx.staffSubjectAssignment.deleteMany({
          where: {
            subjectAllocationId: existing.subjectAllocationId,
            NOT: { id }
          }
        });
      }

      return tx.staffSubjectAssignment.update({
        where: { id },
        data: { staffId },
        include: {
          subjectAllocation: {
            include: {
              standard: { select: { id: true, code: true, name: true } },
              subject: { select: { id: true, code: true, name: true } },
              academicYear: { select: { id: true, name: true } }
            }
          },
          staff: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          }
        }
      });
    });
  }

  /**
   * Delete assignment by ID
   */
  async deleteAssignment(id) {
    await prisma.staffSubjectAssignment.findUniqueOrThrow({ where: { id } });
    return prisma.staffSubjectAssignment.delete({ where: { id } });
  }

  /**
   * Get all assignments for a specific staff member
   */
  async getStaffAssignments(staffId, academicYearId = null) {
    const where = { staffId };
    if (academicYearId) {
      where.subjectAllocation = { academicYearId };
    }

    return prisma.staffSubjectAssignment.findMany({
      where,
      include: {
        subjectAllocation: {
          include: {
            standard: { select: { id: true, code: true, name: true } },
            subject: { select: { id: true, code: true, name: true } },
            academicYear: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: {
        subjectAllocation: {
          academicYear: { startDate: 'desc' }
        }
      }
    });
  }

  /**
   * Get assignments for a specific standard + subject combo
   */
  async getSubjectAssignments(standardId, subjectId, academicYearId = null) {
    const where = {
      subjectAllocation: { standardId, subjectId }
    };
    if (academicYearId) {
      where.subjectAllocation.academicYearId = academicYearId;
    }

    return prisma.staffSubjectAssignment.findMany({
      where,
      include: {
        staff: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        },
        subjectAllocation: {
          include: {
            academicYear: { select: { id: true, name: true } }
          }
        }
      }
    });
  }

  /**
   * Bulk assign / unassign (used by "Publish Assignment" button)
   * Payload: { academicYearId, assignments: [{ standardId, subjectId, staffId }] }
   */
  async bulkAssign({ academicYearId, assignments }) {
    const results = { success: [], failed: [] };

    for (const item of assignments) {
      try {
        const result = await this.assignStaff({
          academicYearId: item.academicYearId || academicYearId,
          standardId: item.standardId,
          subjectId: item.subjectId,
          staffId: item.staffId || null
        });
        results.success.push(result);
      } catch (error) {
        results.failed.push({
          data: item,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get available staff for dropdown
   */
  async getAvailableStaff(academicYearId = null) {
    const staff = await prisma.staff.findMany({
      where: {
        isActive: true,
        user: { isActive: true }
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        subjectAssignments: academicYearId
          ? {
              where: {
                subjectAllocation: { academicYearId }
              },
              include: {
                subjectAllocation: {
                  include: {
                    standard: { select: { id: true, name: true, code: true } },
                    subject: { select: { id: true, name: true, code: true } }
                  }
                }
              }
            }
          : {
              include: {
                subjectAllocation: {
                  include: {
                    standard: { select: { id: true, name: true, code: true } },
                    subject: { select: { id: true, name: true, code: true } }
                  }
                }
              }
            }
      },
      orderBy: {
        user: { name: 'asc' }
      }
    });

    return staff.map(s => ({
      id: s.id,
      userId: s.user.id,
      name: s.user.name,
      email: s.user.email,
      employeeCode: s.employeeCode,
      designation: s.designation,
      department: s.department,
      currentAssignments: s.subjectAssignments.map(a => ({
        standardName: a.subjectAllocation.standard.name,
        subjectName: a.subjectAllocation.subject.name
      })),
      assignmentCount: s.subjectAssignments.length
    }));
  }
}

export default new StaffAssignmentService();