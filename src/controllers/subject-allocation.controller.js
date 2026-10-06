import subjectAllocationService from '../services/subject-allocation.service.js';

class SubjectAllocationController {
  /**
   * Get all allocations
   */
  async list(req, res) {
    const { academicYearId, standardId, subjectId } = req.query;
    
    const allocations = await subjectAllocationService.getAllAllocations({
      academicYearId,
      standardId,
      subjectId
    });
    
    res.json({
      success: true,
      data: allocations,
      count: allocations.length
    });
  }

  /**
   * Get allocations for a specific standard
   */
  async getByStandard(req, res) {
    const { standardId } = req.params;
    const { academicYearId } = req.query;
    
    const allocations = await subjectAllocationService.getAllocationsForStandard(
      standardId,
      academicYearId
    );
    
    res.json({
      success: true,
      data: allocations,
      count: allocations.length
    });
  }

  /**
   * Get available subjects for a standard
   */
  async getAvailableSubjects(req, res) {
    const { standardId } = req.params;
    const { academicYearId } = req.query;
    
    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        error: 'academicYearId is required'
      });
    }
    
    const subjects = await subjectAllocationService.getAvailableSubjects(
      standardId,
      academicYearId
    );
    
    res.json({
      success: true,
      data: subjects,
      count: subjects.length
    });
  }

  /**
   * Get a single allocation by ID
   */
  async get(req, res) {
    const { id } = req.params;
    const allocation = await subjectAllocationService.getAllocationById(id);
    
    res.json({
      success: true,
      data: allocation
    });
  }

  /**
   * Create a new allocation
   */
  async create(req, res) {
    const { academicYearId, standardId, subjectId } = req.body;
    
    if (!academicYearId || !standardId || !subjectId) {
      return res.status(400).json({
        success: false,
        error: 'academicYearId, standardId, and subjectId are required'
      });
    }
    
    const allocation = await subjectAllocationService.createAllocation({
      academicYearId,
      standardId,
      subjectId
    });
    
    res.status(201).json({
      success: true,
      data: allocation,
      message: 'Subject assigned to class successfully'
    });
  }

  /**
   * Bulk create allocations
   */
  async bulkCreate(req, res) {
    const { allocations } = req.body;
    
    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'allocations array is required and must not be empty'
      });
    }
    
    const results = await subjectAllocationService.bulkCreateAllocations(allocations);
    
    res.status(201).json({
      success: true,
      data: results,
      message: `Successfully created ${results.success.length} allocations, ${results.failed.length} failed`
    });
  }

  /**
   * Delete an allocation
   */
  async remove(req, res) {
    const { id } = req.params;
    await subjectAllocationService.deleteAllocation(id);
    
    res.json({
      success: true,
      message: 'Subject allocation deleted successfully'
    });
  }

  /**
   * Bulk delete allocations for a standard
   */
  async bulkRemove(req, res) {
    const { standardId } = req.params;
    const { academicYearId } = req.body;
    
    if (!academicYearId) {
      return res.status(400).json({
        success: false,
        error: 'academicYearId is required'
      });
    }
    
    const result = await subjectAllocationService.bulkDeleteAllocations(
      standardId,
      academicYearId
    );
    
    res.json({
      success: true,
      data: result,
      message: `Deleted ${result.count} allocations`
    });
  }
  /**
 * Get subjects with allocation status for a standard
 * This is the main endpoint for the edit page
 */
async getSubjectsWithStatus(req, res) {
  const { standardId } = req.params;
  const { academicYearId } = req.query;
  
  if (!academicYearId) {
    return res.status(400).json({
      success: false,
      error: 'academicYearId is required'
    });
  }
  
  const subjects = await subjectAllocationService.getSubjectsWithAllocationStatus(
    standardId,
    academicYearId
  );
  
  res.json({
    success: true,
    data: subjects,
    count: subjects.length
  });
}

/**
 * Toggle a single subject allocation
 */
async toggleAllocation(req, res) {
  const { standardId, subjectId } = req.params;
  const { academicYearId, assign } = req.body;
  
  if (!academicYearId) {
    return res.status(400).json({
      success: false,
      error: 'academicYearId is required'
    });
  }
  
  if (typeof assign !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'assign must be a boolean value'
    });
  }
  
  const result = await subjectAllocationService.toggleSubjectAllocation(
    standardId,
    academicYearId,
    subjectId,
    assign
  );
  
  res.json({
    success: true,
    data: result,
    message: assign ? 'Subject assigned successfully' : 'Subject unassigned successfully'
  });
}

/**
 * Bulk update allocations
 */
async bulkUpdate(req, res) {
  const { standardId } = req.params;
  const { academicYearId, subjectIds, action } = req.body;
  
  if (!academicYearId) {
    return res.status(400).json({
      success: false,
      error: 'academicYearId is required'
    });
  }
  
  if (!subjectIds || !Array.isArray(subjectIds) || subjectIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'subjectIds array is required and must not be empty'
    });
  }
  
  if (!['assign', 'unassign'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'action must be either "assign" or "unassign"'
    });
  }
  
  const results = await subjectAllocationService.bulkUpdateAllocations(
    standardId,
    academicYearId,
    subjectIds,
    action
  );
  
  res.json({
    success: true,
    data: results,
    message: `Successfully ${action}ed ${results.success.length} subjects, ${results.failed.length} failed`
  });
}
}

export default new SubjectAllocationController();