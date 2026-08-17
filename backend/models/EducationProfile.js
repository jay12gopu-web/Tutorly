const mongoose = require("mongoose");

const futureTrackSchema = new mongoose.Schema(
  {
    track: { type: String, trim: true },
    status: { type: String, default: "planned", trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { _id: false }
);

const educationProfileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true, trim: true },
    educationLevel: {
      type: String,
      enum: ["school", "intermediate", "college", "certification", "competitive_exam", "language_learning", "other"],
      default: "school",
      index: true
    },
    school: {
      classLevel: { type: String, trim: true },
      board: { type: String, trim: true },
      schoolName: { type: String, trim: true }
    },
    intermediate: {
      stream: { type: String, trim: true },
      board: { type: String, trim: true },
      institutionName: { type: String, trim: true }
    },
    college: {
      program: { type: String, enum: ["Diploma", "Undergraduate", "Postgraduate", ""], default: "" },
      courseGroup: { type: String, trim: true },
      course: { type: String, trim: true },
      customCourse: { type: String, trim: true },
      year: { type: String, trim: true },
      semester: { type: String, trim: true },
      collegeName: { type: String, trim: true },
      university: { type: String, trim: true },
      rollNumber: { type: String, trim: true },
      studentId: { type: String, trim: true },
      expectedGraduationYear: { type: Number },
      cgpa: { type: Number, min: 0, max: 10 }
    },
    enabledFeatureFlags: {
      campusWorkspace: { type: Boolean, default: false },
      assignmentAssistant: { type: Boolean, default: false },
      projectAssistant: { type: Boolean, default: false },
      labMode: { type: Boolean, default: false },
      placementPrep: { type: Boolean, default: false },
      cgpaTracker: { type: Boolean, default: false },
      researchMode: { type: Boolean, default: false },
      codingWorkspace: { type: Boolean, default: false },
      campusCalendar: { type: Boolean, default: false },
      advancedAnalytics: { type: Boolean, default: false }
    },
    futureTracks: [futureTrackSchema]
  },
  { timestamps: true }
);

educationProfileSchema.methods.isCollegeLearner = function isCollegeLearner() {
  return this.educationLevel === "college";
};

educationProfileSchema.methods.hasCampusWorkspace = function hasCampusWorkspace(subscription) {
  return this.isCollegeLearner() && subscription?.currentPlan === "pro" && subscription?.status === "active";
};

module.exports = mongoose.model("EducationProfile", educationProfileSchema);
