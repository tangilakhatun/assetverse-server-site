const express = require('express')
const { MongoClient, ServerApiVersion,ObjectId } = require('mongodb');
const cors =require('cors')
const app = express();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const stripe = require("stripe");
require('dotenv').config()
const port =process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const stripeInstance = stripe(STRIPE_KEY);

// middleware 
app.use(express.json());
app.use(cors())

const uri = `mongodb+srv://${process.env.MANAGEMENT_DB}:${process.env.MANAGEMENT_PASSWORD}@cluster0.ri8wtve.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verifytoken 
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if(!authHeader) return res.status(401).json({ message: "No token" });
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch(err) {
        res.status(401).json({ message: "Invalid token" });
    }
};

const verifyHR = (req,res,next)=>{
    if(req.user.role !== "hr") return res.status(403).json({ message:"Not allowed" });
    next();
};

let db, users, assets, requests, assignedAssets, packages, payments, employeeAffiliations;
async function connectDB() {
  try {
    await client.connect();
    db = client.db("assetverse");

    // collection 
    users = db.collection("users");
    assets = db.collection("assets");
    requests = db.collection("requests");
    assignedAssets = db.collection("assignedAssets");
    packages = db.collection("packages");
    payments = db.collection("payments");
    employeeAffiliations = db.collection("employeeAffiliations");
    console.log("MongoDB Connected");
  } catch (err) {
    console.error(err);
  }
}
connectDB();


// user profil
app.get("/api/users/me", verifyToken, async (req, res) => {
    const user = await users.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
});

// update profile 

app.put("/api/users/me", verifyToken, async (req,res)=>{
    const update = { ...req.body, updatedAt:new Date() };
    await users.updateOne({ email:req.user.email }, { $set:update });
    const updatedUser = await users.findOne({ email:req.user.email });

    // Optional: context/frontend consistency
    res.json({
        ...updatedUser,
        photoURL: updatedUser.profileImage
    });
});

// login 
app.post("/api/auth/firebase-login", async (req,res)=>{
    const { email } = req.body;
    const user = await users.findOne({ email });
    if(!user) return res.status(404).json({ message:"User not found" });
    const token = jwt.sign({ email:user.email, role:user.role, companyName: user.companyName  }, JWT_SECRET, { expiresIn:"7d" });
    res.json({ token });
});

// register hr 
app.post("/api/users/register/hr", async (req,res)=>{
    const { name, email, password, companyName, companyLogo, dateOfBirth } = req.body;
    const existing = await users.findOne({ email });
    if(existing) return res.status(400).json({ message:"Email exists" });
    const hashed = await bcrypt.hash(password, 10);
    const newHR = { name,email,password:hashed,companyName,companyLogo,role:"hr",packageLimit:5,currentEmployees:0,subscription:"basic",dateOfBirth,createdAt:new Date(),updatedAt:new Date() };
    await users.insertOne(newHR);
    res.json({ message:"HR registered" });
});

// register emploee 


// Register Employee
app.post("/api/users/register/employee", async (req, res) => {
  const { name, email, password, dateOfBirth, companyName } = req.body;

  const existing = await users.findOne({ email });
  if (existing) return res.status(400).json({ message: "Email exists" });

  const hashed = await bcrypt.hash(password, 10);
  const newEmp = {
    name,
    email,
    password: hashed,
    role: "employee",
    dateOfBirth,
    companyName: companyName || "",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await users.insertOne(newEmp);

 


  res.json({ message: "Employee registered (pending approval)" });
});

       // api/employees 
app.get("/api/employees", async (req, res) => {
  try {
   
    const affiliations = await employeeAffiliations.find({}).toArray();

    const usersList = await users.find({ role: "employee" }).toArray();

    
    const employees = usersList.map(emp => {
      const aff = affiliations.find(a => a.employeeEmail === emp.email);
      return {
        _id: emp._id,
        name: emp.name,
        employeeEmail: emp.email,       // frontend match
        companyName: aff?.companyName || emp.companyName || "",
        status: aff?.status || "active",
        affiliationDate: aff?.affiliationDate || null
      };
    });

    res.json(employees);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch employees" });
  }
});



//  Get all assets 
app.get("/api/assets", verifyToken, async (req,res)=>{
    const data = await assets.find({}).toArray();
    res.json(data);
});

// Add Asset (HR)
app.post("/api/assets", verifyToken, verifyHR, async (req,res)=>{
   const { productName, productImage, productType, productQuantity } = req.body;

const quantity = Number(productQuantity);

const asset = {
  productName,
  productImage: productImage?.trim() || "https://i.ibb.co/3Y1vZpB/asset.png",
  productType,
  productQuantity: quantity,
  availableQuantity: quantity,
  dateAdded: new Date(),
  hrEmail: req.user.email,
  companyName: req.user.companyName || ""
};

await assets.insertOne(asset);

    res.json({ message:"Asset added" });
});


// Update Asset (HR)
app.put("/api/assets/:id", verifyToken, verifyHR, async (req, res) => {
  const { id } = req.params;

  await assets.updateOne(
    { _id: new ObjectId(id) }, 
    { $set: req.body }
  );

  res.json({ message: "Asset updated" });
});

// Delete Asset
app.delete("/api/assets/:id", verifyToken, verifyHR, async (req, res) => {
  const { id } = req.params;

  const result = await assets.deleteOne({
    _id: new ObjectId(id),
    hrEmail: req.user.email 
  });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: "Asset not found or not allowed" });
  }

  res.json({ message: "Asset deleted" });
});





            // end assets crud operations 
  
            // requests api start
            

// Employee requests an asset
app.post("/api/requests", verifyToken, async (req, res) => {
  const { assetId, note } = req.body;      
  if (!ObjectId.isValid(assetId)) return res.status(400).json({ message: "Invalid asset ID" });

  const asset = await assets.findOne({ _id: new ObjectId(assetId) });
  if (!asset) return res.status(404).json({ message: "Asset not found" });
  if (asset.availableQuantity < 1) return res.status(400).json({ message: "Not available" });

  const reqDoc = {
    assetId: new ObjectId(assetId),
    assetName: asset.productName,
    assetType: asset.productType,
    requesterName: req.user.name,
    requesterEmail: req.user.email,
    hrEmail: asset.hrEmail,
    companyName: asset.companyName,
    requestDate: new Date(),
    approvalDate: null,
    requestStatus: "pending",
    note,
  };

  await requests.insertOne(reqDoc);
  res.json({ message: "Request created" });
});

// HR approves request

app.put("/api/requests/:id/approve", verifyToken, verifyHR, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

   
    const request = await db.collection("requests").findOne({
      _id: new ObjectId(id),
    });
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    
    const asset = await db.collection("assets").findOne({
      _id: new ObjectId(request.assetId),
    });
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }

    
    const availableQty = Number(asset.availableQuantity);
    if (isNaN(availableQty) || availableQty <= 0) {
      return res.status(400).json({ message: "Asset not available" });
    }

    
    await db.collection("requests").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          requestStatus: "approved",
          approvalDate: new Date(),
          processedBy: req.user.email,
        },
      }
    );

    // 2️⃣ Update asset quantity
    await db.collection("assets").updateOne(
      { _id: asset._id },
      { $set: { availableQuantity: availableQty - 1 } }
    );

    // 3️⃣ Employee affiliation
    const affiliationExists = await db.collection("employeeAffiliations").findOne({
      employeeEmail: request.requesterEmail,
      hrEmail: asset.hrEmail,
    });

    if (!affiliationExists) {
      await db.collection("employeeAffiliations").insertOne({
        employeeEmail: request.requesterEmail,
        employeeName: request.requesterName || "—",
        hrEmail: asset.hrEmail,
        companyName: asset.companyName,
        companyLogo: asset.companyLogo || null,
        affiliationDate: new Date(),
        status: "active",
      });

      // Increment HR currentEmployees
      await db.collection("users").updateOne(
        { email: asset.hrEmail },
        { $inc: { currentEmployees: 1 } }
      );
    }

    // 4️⃣ Insert into assignedAssets
    await db.collection("assignedAssets").insertOne({
      assetId: asset._id,
      assetName: asset.productName,
      assetType: asset.productType,
      assetImage: asset.productImage || null,
      employeeEmail: request.requesterEmail,
      employeeName: request.requesterName || "—",
      hrEmail: asset.hrEmail,
      companyName: asset.companyName,
      assignmentDate: new Date(),
      status: "assigned",
    });

    
    res.json({ message: "Request approved successfully" });
  } catch (err) {
    console.error("Approve error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// HR rejects request
app.put("/api/requests/:id/reject", verifyToken, verifyHR, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid request ID" });

  const reqDoc = await requests.findOne({ _id: new ObjectId(id) });
  if (!reqDoc) return res.status(404).json({ message: "Request not found" });

  await requests.updateOne(
    { _id: new ObjectId(id) },
    { $set: { requestStatus: "rejected", approvalDate: new Date(), processedBy: req.user.email } }
  );

  res.json({ message: "Request rejected" });
});

// HR gets all requests
app.get("/api/requests", verifyToken, verifyHR, async (req, res) => {
  const data = await requests.find({ hrEmail: req.user.email }).toArray();
  res.json(data);
});



                 // request api end 
      //  assigned assets 

      app.get("/api/assigned/my-assets", verifyToken, async (req,res)=>{
    const data = await assignedAssets.find({ employeeEmail:req.user.email }).toArray();
    res.json(data);
});

// Return asset
app.put("/api/assigned/:id/return", verifyToken, async (req,res)=>{
    const { id } = req.params;
    const doc = await assignedAssets.findOne({ _id:ObjectId(id) });
    if(!doc) return res.status(404).json({ message:"Not found" });
    if(doc.status === "returned") return res.status(400).json({ message:"Already returned" });

    await assignedAssets.updateOne({ _id:ObjectId(id) }, { $set:{ status:"returned", returnDate:new Date() } });
    await assets.updateOne({ _id:doc.assetId }, { $inc:{ availableQuantity:1 } });
    res.json({ message:"Asset returned" });
});

app.get("/api/employees", verifyToken, verifyHR, async (req, res) => {
  const employees = await employeeAffiliations.aggregate([
    { $match: { hrEmail: req.user.email, status: "active" } },
    {
      $lookup: {
        from: "users",
        localField: "employeeEmail",
        foreignField: "email",
        as: "user"
      }
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: "$user._id",
        name: "$user.name",
        employeeEmail: 1,
        companyName: 1,
        status: 1,
        affiliationDate: 1
      }
    }
  ]).toArray();

  res.json(employees);
});


app.delete("/api/employees/:email", verifyToken, verifyHR, async (req,res)=>{
    const { email } = req.params;
    await employeeAffiliations.updateMany({ employeeEmail:email, hrEmail:req.user.email }, { $set:{ status:"inactive" } });
    await assignedAssets.updateMany({ employeeEmail:email, hrEmail:req.user.email, status:"assigned" }, { $set:{ status:"returned", returnDate:new Date() } });
    res.json({ message:"Employee removed" });
});

app.get("/api/employee/my-team", verifyToken, async (req, res) => {
  const data = await employeeAffiliations.aggregate([
    { $match: { employeeEmail: req.user.email, status: "active" } },
    {
      $lookup: {
        from: "users",
        localField: "employeeEmail",
        foreignField: "email",
        as: "me"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "hrEmail",
        foreignField: "email",
        as: "hr"
      }
    },
    { $unwind: "$hr" },
    {
      $project: {
        companyName: 1,
        employeeEmail: "$hr.email",
        employeeName: "$hr.name",
        affiliationDate: 1,
        profileImage: "$hr.profileImage",
        dateOfBirth: "$hr.dateOfBirth"
      }
    }
  ]).toArray();

  res.json(data);
});

    // packages 


// Get packages
app.get("/api/packages", async (req,res)=>{
    const data = await packages.find({}).toArray();
    res.json(data);
});



// Upgrade package (Stripe)
app.post("/api/packages/upgrade", verifyToken, verifyHR, async (req,res)=>{
    const { packageName, employeeLimit, amount, transactionId } = req.body;
    await users.updateOne({ email:req.user.email }, { $set:{ packageLimit:employeeLimit, subscription:packageName, updatedAt:new Date() } });
    await payments.insertOne({ hrEmail:req.user.email, packageName, employeeLimit, amount, transactionId, paymentDate:new Date(), status:"completed" });
    res.json({ message:"Package upgraded" });
});

 // Top 5 requested assets
app.get("/api/assets/top-requested", verifyToken, verifyHR, async (req,res)=>{
    try{
        // Group requests by assetName and count
        const pipeline = [
            { $match: { hrEmail: req.user.email } }, // only this HR's requests
            { $group: { _id: "$assetName", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ];
        const topAssets = await requests.aggregate(pipeline).toArray();
        res.json(topAssets.map(a => ({ name: a._id, requests: a.count })));
    } catch(err) {
        res.status(500).json({ message:"Server error", error: err.message });
    }
});

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
