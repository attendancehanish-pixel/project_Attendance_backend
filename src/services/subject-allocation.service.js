import prisma from '../lib/prisma.js';

class SubjectAllocationService {
  /**
   * Get all subject allocations with filters
   */
  async getAllAllocations(filters = {}) {
    const { academicYearId, standardId, subjectId } = filters;
    
    const where = {};
    if (academicYearId) where.academicYearId = academicYearId;
    if (standardId) where.standardId = standardId;
    if (subjectId) where.subjectId = subjectId;
    
    return prisma.subjectAllocation.findMany({
      where,
      include: {
        academicYear: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true
          }
        },
        standard: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true
          }
        },
        staffAssignments: {
          include: {
            staff: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
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
  }

  /**
   * Get allocations for a specific standard (for the class detail modal)
   */
  async getAllocationsForStandard(standardId, academicYearId = null) {
    const where = { standardId };
    if (academicYearId) {
      where.academicYearId = academicYearId;
    }
    
    return prisma.subjectAllocation.findMany({
      where,
      include: {
        academicYear: {
          select: {
            id: true,
            name: true
          }
        },
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true
          }
        },
        staffAssignments: {
          include: {
            staff: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        subject: {
          name: 'asc'
        }
      }
    });
  }

  /**
   * Get available subjects for a standard (not yet allocated)
   */
  async getAvailableSubjects(standardId, academicYearId) {
    // Get all subjects
    const allSubjects = await prisma.subject.findMany({
      where: {
        // You might want to filter by active subjects
      },
      select: {
        id: true,
        code: true,
        name: true,
        credits: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Get already allocated subject IDs for this standard and academic year
    const allocated = await prisma.subjectAllocation.findMany({
      where: {
        standardId,
        academicYearId
      },
      select: {
        subjectId: true
      }
    });

    const allocatedIds = new Set(allocated.map(a => a.subjectId));
    
    // Filter out allocated subjects
    return allSubjects.filter(subject => !allocatedIds.has(subject.id));
  }

  /**
   * Get a single allocation by ID
   */
  async getAllocationById(id) {
    return prisma.subjectAllocation.findUniqueOrThrow({
      where: { id },
      include: {
        academicYear: {
          select: {
            id: true,
            name: true
          }
        },
        standard: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true
          }
        },
        staffAssignments: {
          include: {
            staff: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  /**
   * Create a new subject allocation (assign subject to class)
   */
  async createAllocation(data) {
    const { academicYearId, standardId, subjectId } = data;
    
    // Check if allocation already exists
    const existing = await prisma.subjectAllocation.findUnique({
      where: {
        academicYearId_standardId_subjectId: {
          academicYearId,
          standardId,
          subjectId
        }
      }
    });
    
    if (existing) {
      throw new Error('This subject is already allocated to this class for this academic year');
    }
    
    // Verify all entities exist
    await this.validateEntities(academicYearId, standardId, subjectId);
    
    return prisma.subjectAllocation.create({
      data: {
        academicYearId,
        standardId,
        subjectId
      },
      include: {
        academicYear: {
          select: {
            id: true,
            name: true
          }
        },
        standard: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true
          }
        }
      }
    });
  }

  /**
   * Bulk create subject allocations
   */
  async bulkCreateAllocations(allocations) {
    const results = {
      success: [],
      failed: []
    };
    
    for (const allocation of allocations) {
      try {
        const created = await this.createAllocation(allocation);
        results.success.push(created);
      } catch (error) {
        results.failed.push({
          data: allocation,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Delete a subject allocation
   */
  async deleteAllocation(id) {
    // Check if allocation exists
    await prisma.subjectAllocation.findUniqueOrThrow({
      where: { id }
    });
    
    // Check if there are any staff assignments for this allocation
    const assignments = await prisma.staffSubjectAssignment.findMany({
      where: {
        subjectAllocationId: id
      }
    });
    
    if (assignments.length > 0) {
      throw new Error(`Cannot delete allocation with ${assignments.length} staff assignment(s). Remove staff assignments first.`);
    }
    
    return prisma.subjectAllocation.delete({
      where: { id }
    });
  }

  /**
   * Bulk delete allocations for a standard and academic year
   */
  async bulkDeleteAllocations(standardId, academicYearId) {
    // First get all allocations
    const allocations = await prisma.subjectAllocation.findMany({
      where: {
        standardId,
        academicYearId
      },
      include: {
        staffAssignments: true
      }
    });

    // Check if any have staff assignments
    const withAssignments = allocations.filter(a => a.staffAssignments.length > 0);
    if (withAssignments.length > 0) {
      throw new Error(
        `Cannot delete ${withAssignments.length} allocation(s) with staff assignments. ` +
        `Remove staff assignments first for: ${withAssignments.map(a => a.subject.name).join(', ')}`
      );
    }

    // Delete all allocations
    return prisma.subjectAllocation.deleteMany({
      where: {
        standardId,
        academicYearId
      }
    });
  }

  /**
   * Validate that all entities exist
   */
  async validateEntities(academicYearId, standardId, subjectId) {
    const checks = [];
    
    if (academicYearId) {
      checks.push(
        prisma.academicYear.findUnique({
          where: { id: academicYearId }
        }).then(year => {
          if (!year) throw new Error(`Academic year with ID ${academicYearId} not found`);
          return year;
        })
      );
    }
    
    if (standardId) {
      checks.push(
        prisma.standard.findUnique({
          where: { id: standardId }
        }).then(standard => {
          if (!standard) throw new Error(`Standard with ID ${standardId} not found`);
          return standard;
        })
      );
    }
    
    if (subjectId) {
      checks.push(
        prisma.subject.findUnique({
          where: { id: subjectId }
        }).then(subject => {
          if (!subject) throw new Error(`Subject with ID ${subjectId} not found`);
          return subject;
        })
      );
    }
    
    await Promise.all(checks);
  }
  /**
 * Get all subjects with allocation status for a specific standard and academic year
 * This returns a unified list showing which subjects are assigned
 */
async getSubjectsWithAllocationStatus(standardId, academicYearId) {
  // Get all subjects
  const allSubjects = await prisma.subject.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      credits: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      name: 'asc' // Order by name, or you can change to code or any other field
    }
  });

  // Get allocated subjects for this standard and academic year
  const allocations = await prisma.subjectAllocation.findMany({
    where: {
      standardId,
      academicYearId
    },
    include: {
      subject: true,
      staffAssignments: {
        include: {
          staff: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  // Create a map for quick lookup
  const allocationMap = {};
  allocations.forEach(alloc => {
    allocationMap[alloc.subjectId] = alloc;
  });

  // Build the unified list
  return allSubjects.map(subject => {
    const allocation = allocationMap[subject.id];
    return {
      ...subject,
      isAllocated: !!allocation,
      allocationId: allocation?.id || null,
      staffAssignments: allocation?.staffAssignments || [],
      // You can add more fields from allocation if needed
    };
  });
}

/**
 * Toggle subject allocation (assign or unassign)
 */
async toggleSubjectAllocation(standardId, academicYearId, subjectId, assign) {
  if (assign) {
    // Check if already allocated
    const existing = await prisma.subjectAllocation.findUnique({
      where: {
        academicYearId_standardId_subjectId: {
          academicYearId,
          standardId,
          subjectId
        }
      }
    });
    
    if (existing) {
      throw new Error('Subject is already allocated to this class');
    }
    
    // Create allocation
    return prisma.subjectAllocation.create({
      data: {
        academicYearId,
        standardId,
        subjectId
      },
      include: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true
          }
        }
      }
    });
  } else {
    // Remove allocation
    const allocation = await prisma.subjectAllocation.findUnique({
      where: {
        academicYearId_standardId_subjectId: {
          academicYearId,
          standardId,
          subjectId
        }
      }
    });
    
    if (!allocation) {
      throw new Error('Subject is not allocated to this class');
    }
    
    // Check if there are staff assignments
    const staffAssignments = await prisma.staffSubjectAssignment.findMany({
      where: {
        subjectAllocationId: allocation.id
      }
    });
    
    if (staffAssignments.length > 0) {
      throw new Error(
        `Cannot unassign subject - it has ${staffAssignments.length} staff assignment(s). ` +
        `Remove staff assignments first.`
      );
    }
    
    return prisma.subjectAllocation.delete({
      where: {
        id: allocation.id
      }
    });
  }
}

/**
 * Bulk update subject allocations (assign/unassign multiple at once)
 */
async bulkUpdateAllocations(standardId, academicYearId, subjectIds, action) {
  const results = {
    success: [],
    failed: []
  };

  for (const subjectId of subjectIds) {
    try {
      const result = await this.toggleSubjectAllocation(
        standardId,
        academicYearId,
        subjectId,
        action === 'assign'
      );
      results.success.push(result);
    } catch (error) {
      results.failed.push({
        subjectId,
        error: error.message
      });
    }
  }

  return results;
}

}

export default new SubjectAllocationService();