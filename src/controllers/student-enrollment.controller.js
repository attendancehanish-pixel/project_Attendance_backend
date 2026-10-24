import studentEnrollmentService from '../services/student-enrollment.service.js';

class StudentEnrollmentController {
  async list(req, res) {
    const data = await studentEnrollmentService.list({
      academicYearId: req.query.academicYearId,
      standardId: req.query.standardId,
      status: req.query.status,
      search: req.query.search,
    });
    res.json({ success: true, data, count: data.length });
  }

  async get(req, res) {
    const data = await studentEnrollmentService.getById(req.params.id);
    res.json({ success: true, data });
  }

  async setup(req, res) {
    const data = await studentEnrollmentService.getSetup(
      req.params.academicYearId,
      req.query.standardId
    );
    res.json({ success: true, data });
  }

  async lookup(req, res) {
    const data = await studentEnrollmentService.lookupStudents({
      academicYearId: req.query.academicYearId,
      q: req.query.q,
      limit: req.query.limit,
    });
    res.json({ success: true, data });
  }

  async nextRollNo(req, res) {
    const data = await studentEnrollmentService.getNextRollNo({
      academicYearId: req.query.academicYearId,
      standardId: req.query.standardId,
    });
    res.json({ success: true, data });
  }

  async bulkEnroll(req, res) {
    const { academicYearId, standardId, status, enrollments } = req.body;
    const result = await studentEnrollmentService.bulkEnroll({
      academicYearId,
      standardId,
      status,
      enrollments,
    });

    res.status(201).json({
      success: true,
      data: result.data,
      count: result.count,
      message: `${result.count} student enrollment(s) created successfully`,
    });
  }

  async update(req, res) {
    const data = await studentEnrollmentService.update(req.params.id, req.body);
    res.json({ success: true, data, message: 'Student enrollment updated successfully' });
  }

  async remove(req, res) {
    await studentEnrollmentService.remove(req.params.id);
    res.json({ success: true, message: 'Student enrollment removed successfully' });
  }
}

export default new StudentEnrollmentController();
