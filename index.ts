import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { MongoClient, Collection, ObjectId } from 'mongodb'; 
import * as dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();

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
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000
});

// গ্লোবাল স্কোপে কালেকশন দুটির টাইপ ডিফাইন করা হলো
let eventCollection: Collection;
let eventBookings: Collection; 
let eventUserCollection: Collection;
let isConnected = false;

// ⚡ কানেকশন ফাংশন
export async function connectToMongoDB() {
  try {
    if (isConnected) return; // অলরেডি কানেক্টেড থাকলে আর নতুন করে করবে না

    await client.connect(); // 🎯 ভার্সেলে এটি আনকমেন্ট থাকা অত্যন্ত জরুরি!
    const database = client.db("event-management");
    
    eventCollection = database.collection("eventmanaging");
    eventBookings = database.collection("eventBookings"); 
    eventUserCollection = database.collection("user");

    isConnected = true;
    console.log("🚀 Connected to MongoDB Cluster Stream!");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    isConnected = false;
    throw err;
  }
}

// 🎯 ভার্সেল স্পেশাল মিডলওয়্যার: যেকোনো রিকোয়েস্ট প্রসেস করার আগে ডাটাবেজ কানেক্টেড কি না তা নিশ্চিত করবে
const ensureDbConnection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectToMongoDB();
    next();
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Database connection failed", error: err.message });
  }
};

// সব রুটে ডাটাবেজ কানেকশন নিশ্চিত করার মিডলওয়্যার যুক্ত করা হলো
app.use(ensureDbConnection);


// ==================== API ROUTES ====================

app.delete("/api/eventmanage/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Event Identifier." });
    }
    const result = await eventCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) {
      return res.status(200).json({ success: true, message: "Event payload deleted successfully." });
    } else {
      return res.status(404).json({ success: false, message: "Event node not found." });
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/events/count", async (req: Request, res: Response): Promise<any> => {
  try {
    const totalEvents = await eventCollection.countDocuments({});
    return res.status(200).json({ count: totalEvents });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/users", async (req: Request, res: Response): Promise<any> => {
  try {
    const users = await eventUserCollection.find({}).toArray();
    return res.status(200).json(users);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.patch("/api/eventmanage/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { title, date, tickets, price, location } = req.body;
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

app.get("/api/userprofile", async (req: Request, res: Response) => {
  try {
    const { email } = req.query;
    if (!email) {
       res.status(400).json({ success: false, message: "Email parameter is required." });
       return;
    }
    const userProfile = await eventUserCollection.findOne({ email: email as string });
    if (!userProfile) {
       res.status(404).json({ success: false, message: "User profile not found." });
       return;
    }
     res.status(200).json(userProfile);
     return;
  } catch (error: any) {
     res.status(500).json({ success: false, message: "Internal server error", error: error.message });
     return;
  }
});

app.post("/api/mybookings", async (req: Request, res: Response) => {
  try {
    const bookingData: BookingPayload = req.body;
    if (!bookingData.eventId || !bookingData.title) {
       res.status(400).json({ success: false, message: "Mandatory field missing." });
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
     res.status(201).json({ success: true, insertedId: result.insertedId });
     return;
  } catch (error: any) {
     res.status(500).json({ success: false, error: error.message });
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
      { $set: { approved: false } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User node not found." });
    }
    return res.status(200).json({ success: true, message: "User access suspended!" });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.patch("/api/users/:id/approve", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID." });
    }
    const result = await eventUserCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approved: true } }
    );
    return res.status(200).json({ success: true, message: "User approved!" });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/users/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid format." });
    }
    const result = await eventUserCollection.deleteOne({ _id: new ObjectId(id) });
    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/mybookings", async (req: Request, res: Response) => {
  try {
    const { email } = req.query;
    if (!email) {
       res.status(400).json({ success: false, message: "Email missing" });
       return;
    }
    const query = { userEmail: email as string }; 
    const allSynchronizedBookings = await eventBookings.find(query).toArray();
     res.status(200).json(allSynchronizedBookings);
     return;
  } catch (error: any) {
     res.status(500).json({ success: false, error: error.message });
     return;
  }
});

app.delete('/api/mybookings/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const bookingId = req.params.id;
    if (!ObjectId.isValid(bookingId)) {
       res.status(400).json({ success: false, message: "Invalid ID" });
       return;
    }
    await eventBookings.deleteOne({ _id: new ObjectId(bookingId) });
     res.status(200).json({ success: true });
     return;
  } catch (error: any) {
     res.status(500).json({ success: false, error: error.message });
     return;
  }
});

app.post('/api/eventmanage', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const newEvent = { ...event, status: event.status || "pending" };
    const result = await eventCollection.insertOne(newEvent);
     res.status(201).json(result); 
     return;
  } catch (error) {
     res.status(500).json({ message: "Internal Error" });
     return;
  }
});

app.get('/api/eventmanage', async (req: Request, res: Response) => {
  try {
    const events = await eventCollection.find({}).toArray();
     res.status(200).json(events);
     return;
  } catch (error) {
     res.status(500).json({ message: "Error" });
     return;
  }
});

app.patch('/api/eventmanage/:id/status', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!ObjectId.isValid(id)) {
       res.status(400).json({ message: "Invalid ID" });
       return;
    }
    const result = await eventCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: status } }
    );
     res.status(200).json({ message: `Status updated to ${status}!`, result });
     return;
  } catch (error) {
     res.status(500).json({ message: "Server breakdown" });
     return;
  }
});

// ⚡ লোকালহোস্ট টেস্ট করার জন্য রান হবে, কিন্তু ভার্সেলে থাকলে এটি ইগনোর হবে
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`📡 Server running locally on port ${port}`);
  });
}

// 🎯 এটিই সেই মূল রহস্য! এক্সপ্রেস সার্ভারকে মডিউল হিসেবে এক্সপোর্ট করতে হবে যেন ভার্সেল এটি হ্যান্ডেল করতে পারে।
export default app;