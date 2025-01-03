import mongoose, { get } from "mongoose";
const { Schema, Decimal128 } = mongoose;

// Student Schema
const studentSchema = new Schema({
  name: { type: String, required: true, trim: true },
  age: { type: Number, required: true, min: 18, max: 50 },
  fees: {
    type: Decimal128,
    required: true,
    validate: { validator: (v) => v >= 5500.5 },
  },
  hobbies: { type: Array },
  isActive: { type: Boolean, default: true },
  comments: [
    { value: { type: String }, published: { type: Date, default: Date.now } },
  ],
  join: { type: Date, default: Date.now },
});

const studentModel = mongoose.model("Student", studentSchema);

// Teacher Schema
const teacherSchema = new Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, required: true },
  salary: {
    type: Decimal128,
    required: true,
    validate: { validator: (v) => v >= 30000.0 },
  },
  isActive: { type: Boolean, default: true },
  hireDate: { type: Date, default: Date.now },
});

const teacherModel = mongoose.model("Teacher", teacherSchema);

const createDynamicDoc = async (model, data) => {
  try {
    // Create an instance of the model with the provided data
    const doc = new model(data);

    // Save the instance to the database
    const result = await doc.save();

    console.log(`Document saved:`, result);
  } catch (error) {
    console.log(error);
  }
};

const getAllDoc = async () => {
  const students = await studentModel.find();
  // res.json(students);
  students.forEach((student) => {
    console.log(
      // student.name,
      // student.age,
      // student.fees.toString(),
      // student.hobbies[0],
      // student.hobbies[1],
      // student.comments[0].value,
      // student.join
    );
  });
  try {
  } catch (error) {
    // res.status(500).json({ message: error.message });
  }
};

const getSpecificFieldDoc = async () => {
  // const students = await studentModel.find().select('-name -age');
  // const students = await studentModel.findById('6770edbe22e37f99cab8cedd');
  const students = await studentModel.find({age: 25}).select('name age');


  console.log(students)

}

const updateDoc = async (id) => {
  const result = await studentModel.findByIdAndUpdate(id, {name: 'Ahmand'}, {returnDocument: 'before'});
  // const result = await studentModel.findById('6770edbe22e37f99cab8cedd');  
  console.log(result)  
}

export { studentModel, teacherModel, createDynamicDoc, getAllDoc, getSpecificFieldDoc,updateDoc  };
