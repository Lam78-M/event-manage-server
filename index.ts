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
  maxPoolSize: 10,              // একসঙ্গে ১০টি ডাটা পাইপলাইন সচল রাখবে
  serverSelectionTimeoutMS: 5000 // ৫ সেকেন্ডে কানেক্ট না হলে রিলিজ করে দেবে
});

// গ্লোবাল স্কোপে কালেকশন দুটির টাইপ ডিফাইন করা হলো
let eventCollection: Collection;
let eventBookings: Collection; 
let eventUserCollection: Collection;
let isConnected = false;

export async function connectToMongoDB() {
  try {
    if (isConnected) return client; // ⚡ অলরেডি কানেক্টেড থাকলে সাথে সাথে রিটার্ন করবে

    await client.connect();
    console.log("🚀 You successfully connected to MongoDB Cluster Stream!");
    const database = client.db("event-management");
    
    eventCollection = database.collection("eventmanaging");
    eventBookings = database.collection("eventBookings"); 
    eventUserCollection = database.collection("users");

    isConnected = true; 
    return client;
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    isConnected = false;
    throw err;
  }
}

// 🎯 ভার্সেল সার্ভারলেস মিডলওয়্যার: ডাটাবেজ কানেকশন সবসময় সচল রাখবে
const ensureDbConnection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectToMongoDB();
    next();
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Database connection failure.", error: err.message });
  }
};

app.use(ensureDbConnection);

// 🎯 হোম রুট স্বাগত মেসেজ (যাতে Cannot GET / না দেখায়)
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "🚀 Event Sphere Server Matrix is fully operational and running!",
    status: "Healthy"
  });
});


/* ==========================================================
   🛠️ EVENT MANAGEMENT ENDPOINTS (ORGANIZER DASHBOARD)
   ========================================================== */

// 🎯 প্যারামিটার টাইপ { id: string } স্পষ্ট করা হলো
app.delete("/api/eventmanage/:id", async (req: Request<{ id: string }>, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    
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
    const totalEvents = await eventCollection.countDocuments({});
    return res.status(200).json({ count: totalEvents });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 🎯 প্যারামিটার টাইপ { id: string } স্পষ্ট করা হলো
app.patch("/api/eventmanage/:id", async (req: Request<{ id: string }>, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const { title, date, tickets, price, location } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid Event ID format." });
    }

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

// 🎯 প্যারামিটার টাইপ { id: string } স্পষ্ট করা হলো
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


/* ==========================================================
   👥 USERS MANAGEMENT ENDPOINTS
   ========================================================== */

app.get("/api/users", async (req: Request, res: Response): Promise<any> => {
  try {
    const users = await eventUserCollection.find({}).toArray();
    return res.status(200).json(users);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 🎯 প্যারামিটার টাইপ { id: string } স্পষ্ট করা হলো
app.patch("/api/users/:id/pending", async (req: Request<{ id: string }>, res: Response): Promise<any> => {
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
    return res.status(200).json({ success: true, message: "User access temporarily suspended!" });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 🎯 প্যারামিটার টাইপ { id: string } স্পষ্ট করা হলো
app.patch("/api/users/:id/approve", async (req: Request<{ id: string }>, res: Response): Promise<any> => {
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

// 🎯 প্যারামিটার টাইপ { id: string } স্পষ্ট করা হলো
app.delete("/api/users/:id", async (req: Request<{ id: string }>, res: Response): Promise<any> => {
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

app.get("/api/userprofile", async (req: Request, res: Response) => {
  try {
    const email = req.query.email;

    if (!email || typeof email !== 'string') {
       res.status(400).json({ success: false, message: "Valid email parameter is required." });
       return;
    }

    if (!eventUserCollection) {
       res.status(500).json({ success: false, message: "Database collection not initialized yet!" });
       return;
    }

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
   🎟️ BOOKINGS ENDPOINTS
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

app.get("/api/mybookings", async (req: Request, res: Response) => {
  try {
    const email = req.query.email;

    if (!email || typeof email !== 'string') {
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

// 🎯 প্যারামিটার টাইপ { id: string } স্পষ্ট করা হলো
app.delete('/api/mybookings/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const bookingId = req.params.id;
    
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


// ⚡ লোকাল ডেভেলপমেন্ট টেস্ট করার জন্য (ভার্সেলে এই অংশটি অটো ইগনোরড হবে)
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 5000;
  connectToMongoDB().then(() => {
    app.listen(port, () => {
      console.log(`📡 Server running locally on port ${port}`);
    });
  }).catch((err) => {
    console.error("Failed to start server locally due to connection error:", err);
  });
}

// 🎯 সার্ভারলেস ক্লাউডে সাবমিট করার আসল চাবিকাঠি
export default app;