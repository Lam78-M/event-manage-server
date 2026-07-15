import express from 'express';
import { Request, Response } from 'express';
import { MongoClient, Collection, ObjectId } from 'mongodb'; 
import * as dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

interface BookingPayload {
  eventId: string;
  title: string;
  date?: string;
  time?: string;
  location?: string;
  price?: string | number;
  category?: string;
  image?: string;
  bookedAt?: string;
  userEmail: string;
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Critical Error: MONGODB_URI is not defined!");

const client = new MongoClient(uri, {
  maxPoolSize: 10,              // একসঙ্গে ১০টি ডাটা পাইপলাইন সচল রাখবে
  serverSelectionTimeoutMS: 5000 // ৫ সেকেন্ডে কানেক্ট না হলে রিলিজ করে দেবে, ২ মিনিট ঝুলাবে না
});

// গ্লোবাল স্কোপে কালেকশন দুটির টাইপ ডিফাইন করা হলো
let eventCollection: Collection;
let eventBookings: Collection; 
let eventUserCollection: Collection;
let isConnected = false;

export async function connectToMongoDB() {
  try {
    if (isConnected) return client; // ⚡ অলরেডি কানেক্টেড থাকলে সাথে সাথে রিটার্ন করবে

    // await client.connect();
    console.log("🚀 You successfully connected to MongoDB Cluster Stream!");
    const database = client.db("event-management");
    
    eventCollection = database.collection("eventmanaging");
    eventBookings = database.collection("eventBookings"); 
    eventUserCollection = database.collection("user");

    isConnected = true; // 👈 কানেকশন সাকসেস হলে true করে দেবে
    return client;
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    isConnected = false;
  }
}

// manage event for organizer dashboard

app.delete("/api/eventmanage/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id;
    
    // মঙ্গোডিবি আইডি ভ্যালিডেশন
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Event Identifier." });
    }

    const result = await eventCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      return res.status(200).json({ success: true, message: "Event payload deleted successfully from active cluster." });
    } else {
      return res.status(404).json({ success: false, message: "Event node not found." });
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/events/count", async (req: Request, res: Response): Promise<any> => {
  try {
    const totalEvents = await eventCollection.countDocuments({}); // তোমার event collection name
    return res.status(200).json({ count: totalEvents });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

//users 

app.get("/api/users", async (req: Request, res: Response): Promise<any> => {
  try {
    // 🎯 তোমার কালেকশন থেকে সব ইউজার অ্যারে হিসেবে নেওয়া হচ্ছে
    const users = await eventUserCollection.find({}).toArray();
    return res.status(200).json(users);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});


//udate evets

// import { ObjectId } from "mongodb"; // 🎯 ওপরে ইম্পোর্ট করো

app.patch("/api/eventmanage/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { title, date, tickets, price, location } = req.body;

    // 🎯 তোমার আসল কালেকশন "eventmanaging" ব্যবহার করা হলো
    const result = await eventCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          title,
          date,
          tickets: Number(tickets) || 0,
          price,
          location,
        }
      }
    );

    return res.status(200).json({ success: true, message: "Updated!" });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/* ==========================================================
   👤 GET ROUTE: Fetch Current User Profile Details
   ========================================================== */
app.get("/api/userprofile", async (req: Request, res: Response) => {
  try {
    const { email } = req.query;

    if (!email) {
       res.status(400).json({ success: false, message: "Email parameter is required." });
       return;
    }

    if (!eventUserCollection) {
       res.status(500).json({ success: false, message: "Database collection not initialized yet!" });
       return;
    }

    // ইমেইল ম্যাচ করে ইউজার ডেটা খোঁজা হচ্ছে
    const userProfile = await eventUserCollection.findOne({ email: email });

    if (!userProfile) {
       res.status(404).json({ success: false, message: "User profile not found matrix." });
       return;
    }

     res.status(200).json(userProfile);
     return;

  } catch (error: any) {
    console.error("Critical User Get Profile Crash Log:", error);
     res.status(500).json({
      success: false,
      message: "Internal framework connection crash while fetching user profile.",
      error: error.message
    });
     return;
  }
});




/* ==========================================================
   🎟️ 1. POST ROUTE: Launch New Booking Stream
   ========================================================== */
app.post("/api/mybookings", async (req: Request, res: Response) => {
  try {
    const bookingData: BookingPayload = req.body;

    if (!bookingData.eventId || !bookingData.title) {
       res.status(400).json({
        success: false,
        message: "Mandatory metadata framework node (eventId/title) missing."
      });
       return;
    }

    if (!eventBookings) {
       res.status(500).json({ success: false, message: "Database collection not initialized yet!" });
       return;
    }

    const structuredBookingNode = {
      eventId: bookingData.eventId,
      userEmail: bookingData.userEmail,
      title: bookingData.title,
      date: bookingData.date || "",
      time: bookingData.time || "",
      location: bookingData.location || "",
      price: bookingData.price || "0",
      category: bookingData.category || "General",
      image: bookingData.image || "",
      bookedAt: bookingData.bookedAt || new Date().toISOString()
    };

    const result = await eventBookings.insertOne(structuredBookingNode);

     res.status(201).json({
      success: true,
      message: "🎟️ Slot transaction secured inside database matrix.",
      insertedId: result.insertedId
    });
     return;

  } catch (error: any) {
    console.error("Critical Post Stream Crash Log:", error);
     res.status(500).json({
      success: false,
      message: "Internal framework connection crash while mounting post stream.",
      error: error.message
    });
     return;
  }
});

app.patch("/api/users/:id/pending", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid User ID format." });
    }

    const result = await eventUserCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approved: false } } // approved আবার false (Pending) করে দেওয়া হলো
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User node not found." });
    }
    return res.status(200).json({ success: true, message: "User access temporarily suspended!" });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.patch("/api/users/:id/approve", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid User ID format." });
    }

    const result = await eventUserCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approved: true } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User node not found." });
    }
    return res.status(200).json({ success: true, message: "User approved successfully!" });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 🎯 ৩. ইউজার ডিলিট/রিজেক্ট করার API (DELETE)
app.delete("/api/users/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid User ID format." });
    }

    const result = await eventUserCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "User node not found." });
    }
    return res.status(200).json({ success: true, message: "User successfully deleted." });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});



/* ==========================================================
   📡 2. GET ROUTE: Synchronize Active System Booking Streams
   ========================================================== */
app.get("/api/mybookings", async (req: Request, res: Response) => {
  try {
    const { email } = req.query;

    if (!email) {
       res.status(400).json({ success: false, message: "Target user email sequence required tracking parameter node missing." });
       return;
    }

    if (!eventBookings) {
       res.status(500).json({ success: false, message: "Database collection not initialized yet!" });
       return;
    }

    const query = { userEmail: email }; 
    const cursor = eventBookings.find(query);
    const allSynchronizedBookings = await cursor.toArray();

     res.status(200).json(allSynchronizedBookings);
     return;

  } catch (error: any) {
    console.error("Critical Get Stream Crash Log:", error);
     res.status(500).json({
      success: false,
      message: "Internal framework connection crash while mounting get stream.",
      error: error.message
    });
     return;
  }
});

/* ==========================================================
   🗑️ 3. DELETE ROUTE: Cancel Booking Node
   ========================================================== */
// 🎯 এখানে টাইপস্ক্রিপ্টকে স্পষ্ট করে দেওয়ার জন্য { id: string } জেনেরিক প্যারামিটার দেওয়া হয়েছে
app.delete('/api/mybookings/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const bookingId = req.params.id; // 👈 এখন টাইপস্ক্রিপ্ট শিওর যে এটি একটি string
    
    if (!eventBookings) {
       res.status(500).json({ success: false, message: "Database collection not initialized yet!" });
       return;
    }

    // ObjectId ভ্যালিডেশন 
    if (!ObjectId.isValid(bookingId)) {
       res.status(400).json({ success: false, message: "Invalid MongoDB ObjectId string node format." });
       return;
    }
    
    const result = await eventBookings.deleteOne({ _id: new ObjectId(bookingId) });
    
    if (result.deletedCount === 1) {
       res.status(200).json({ success: true, message: "Booking deleted successfully!" });
       return;
    } else {
       res.status(404).json({ success: false, message: "Booking node not found!" });
       return;
    }
    
  } catch (error: any) {
     res.status(500).json({ success: false, error: error.message });
     return;
  }
});

/* ==========================================================
   🚀 EVENT MANAGEMENT ENDPOINTS
   ========================================================== */

app.post('/api/eventmanage', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    
    const newEvent = {
      ...event,
      status: event.status || "pending"
    };
    
    if (!eventCollection) {
       res.status(500).json({ message: "Database collection not initialized yet!" });
       return;
    }

    const result = await eventCollection.insertOne(newEvent);
     res.status(201).json(result); 
     return;
  } catch (error) {
    console.error("Error posting event:", error);
     res.status(500).json({ message: "Internal Server Error during creation matrix" });
     return;
  }
});

app.get('/api/eventmanage', async (req: Request, res: Response) => {
  try {
    if (!eventCollection) {
       res.status(500).json({ message: "Database collection not initialized yet!" });
       return;
    }
    const events = await eventCollection.find({}).toArray();
     res.status(200).json(events);
     return;
  } catch (error) {
    console.error("Error fetching event streams:", error);
     res.status(500).json({ message: "Internal Server Error during collection retrieval" });
     return;
  }
});

// 🎯 এখানেও { id: string } জেনেরিক ডিফাইন করা হয়েছে যেন id টাইপ নিয়ে লাল দাগ চলে যায়
app.patch('/api/eventmanage/:id/status', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!eventCollection) {
       res.status(500).json({ message: "Database collection not initialized yet!" });
       return;
    }

    if (!ObjectId.isValid(id)) {
       res.status(400).json({ message: "Invalid Event ObjectId format." });
       return;
    }

    const result = await eventCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: status } }
    );

    if (result.matchedCount === 0) {
       res.status(404).json({ message: "Target instance event profile matrix not found." });
       return;
    }

     res.status(200).json({ message: `Event status successfully sync to ${status}!`, result });
     return;
  } catch (error) {
    console.error("Error updating status:", error);
     res.status(500).json({ message: "Server breakdown during database status transition execution" });
     return;
  }
});

const startServer = async () => {
  await connectToMongoDB();
  app.listen(port, () => {
    console.log(`📡 Server running on port ${port}`);
  });
};

startServer(); 