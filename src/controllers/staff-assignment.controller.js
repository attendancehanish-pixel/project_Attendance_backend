import staffAssignmentService from '../services/staff-assignment.service.js';

class StaffAssignmentController {
  /**
   * GET /
   * Matrix view when only academicYearId is provided,
   * otherwise filtered list of raw assignments.
   */
  async list(req, res) {
    const { academicYearId, standardId, subjectId, staffId } = req.query;

    let data;
    if (academicYearId && !standardId && !subjectId && !staffId) {
      data = await staffAssignmentService.getSubjectStandardMatrix(academicYearId);
    } else {
      data = await staffAssignmentService.getAllAssignments({
        academicYearId,
        standardId,
        subjectId,
        staffId
      });
    }

    res.json({
      success: true,
      data,
      count: data.length
    });
  }

  /**
   * GET /:id
   */
  async get(req, res) {
    const { id } = req.params;
    const assignment = await staffAssignmentService.getAssignmentById(id);

    res.json({
      success: true,
      data: assignment
    });
  }

  /**
   * POST /
   * Upsert by combo: { academicYearId, standardId, subjectId, staffId }
   * If staffId is omitted/null → unassigns.
   */
  async create(req, res) {
    const { academicYearId, standardId, subjectId, staffId } = req.body;

    if (!academicYearId || !standardId || !subjectId) {
      return res.status(400).json({
        success: false,
        error: 'academicYearId, standardId, and subjectId are required'
      });
    }

    const assignment = await staffAssignmentService.assignStaff({
      academicYearId,
      standardId,
      subjectId,
      staffId: staffId || null
    });

    res.status(201).json({
      success: true,
      data: assignment,
      message: staffId ? 'Staff assigned successfully' : 'Staff unassigned successfully'
    });
  }

  /**
   * PATCH /:id
   * Update an existing assignment record by its ID.
   */
  async update(req, res) {
    const { id } = req.params;
    const { staffId } = req.body;

    if (!staffId) {
      return res.status(400).json({
        success: false,
        error: 'staffId is required for update'
      });
    }

    const assignment = await staffAssignmentService.updateAssignment(id, { staffId });

    res.json({
      success: true,
      data: assignment,
      message: 'Assignment updated successfully'
    });
  }

  /**
   * DELETE /:id
   */
  async remove(req, res) {
    const { id } = req.params;
    await staffAssignmentService.deleteAssignment(id);

    res.json({
      success: true,
      message: 'Assignment deleted successfully'
    });
  }

  /**
   * GET /staff/:staffId/assignments
   */
  async getStaffAssignments(req, res) {
    const { staffId } = req.params;
    const { academicYearId } = req.query;

    const assignments = await staffAssignmentService.getStaffAssignments(
      staffId,
      academicYearId
    );

    res.json({
      success: true,
      data: assignments,
      count: assignments.length
    });
  }

  /**
   * GET /standard/:standardId/subject/:subjectId/assignments
   */
  async getSubjectAssignments(req, res) {
    const { standardId, subjectId } = req.params;
    const { academicYearId } = req.query;

    const assignments = await staffAssignmentService.getSubjectAssignments(
      standardId,
      subjectId,
      academicYearId
    );

    res.json({
      success: true,
      data: assignments,
      count: assignments.length
    });
  }

  /**
   * POST /bulk
   * Body: { academicYearId, assignments: [{ standardId, subjectId, staffId }] }
   */
  async bulkCreate(req, res) {
    const { academicYearId, assignments } = req.body;

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'assignments array is required and must not be empty'
      });
    }

    const results = await staffAssignmentService.bulkAssign({
      academicYearId,
      assignments
    });

    res.status(201).json({
      success: true,
      data: results,
      message: `Successfully processed ${results.success.length} assignments, ${results.failed.length} failed`
    });
  }

  /**
   * GET /available-staff
   */
  async getAvailableStaff(req, res) {
    const { academicYearId } = req.query;

    const staff = await staffAssignmentService.getAvailableStaff(academicYearId);

    res.json({
      success: true,
      data: staff,
      count: staff.length
    });
  }
}

export default new StaffAssignmentController();