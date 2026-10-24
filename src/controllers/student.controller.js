import studentService from '../services/student.service.js';

class StudentController {
  async bulkCreate(req, res) {
    const result = await studentService.bulkCreate(req.body?.students);
    res.status(201).json({
      success: true,
      data: result.data,
      count: result.count,
      message: `${result.count} student(s) created successfully`,
    });
  }
}

export default new StudentController();
