const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(
  "sk_test_51M6B1DFokKCixQB7HSbrpwPXgFbnoUwguMRvfNsOiY0lt2qjFmQl5OQ6sjrWA1FW6083SXAOuR2lMECc5fLHmDiY00Hd7k0Au7"
);

const port = process.nextTick.PORT || 4000;
require("dotenv").config();
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// MONGO CONNECT

const uri = `mongodb+srv://${process.env.MONGOID}:${process.env.MONGOPASSWORD}@cluster0.ha2hum3.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

//Note: make sure you verifyAdmin after verifyJwt
const verifyAdmin = async (req, res, next) => {
  try {
    const decodedEmail = req.decoded.email;
    const query = { email: decodedEmail };
    const user = await usersCollection.findOne(query);
    if (user?.role !== "admin") {
      return res.status(403).send({ message: "forbidden access" });
    }
    const id = req.params.id;
    const filter = { _id: ObjectId(id) };
    const options = { upsert: true };
    const updateDoc = {
      $set: {
        role: "admin",
      },
    };
    const result = await usersCollection.updateOne(filter, updateDoc, options);
    res.send(result);
  } catch (error) {
    res.send(error.message);
  }
};
const run = async () => {
  try {
    client.connect();
    console.log("mongo connect");
  } catch (error) {
    console.log(error.name, error.message);
  }
};
run();
const appointmentOptionCollection = client
  .db("doctoreCoollection")
  .collection("appointmentOption");
const bookingCollection = client
  .db("doctoreCoollection")
  .collection("bookings");
const usersCollection = client.db("doctoreCoollection").collection("users");
const doctorsCollection = client.db("doctoreCoollection").collection("doctors");
const paymentsCollection = client
  .db("doctoreCoollection")
  .collection("payments");
app.get("/", async (req, res) => {
  res.send("doctors portale is running");
});

app.get("/appointment", async (req, res) => {
  try {
    const date = req.query.date;
    const query = {};
    const result = appointmentOptionCollection.find(query);
    const data = await result.toArray();

    // specify date is booking now

    const bookingQuery = { appointmentDate: date };
    const alreadyBooking = await bookingCollection.find(bookingQuery).toArray();

    // code carefully
    data.forEach((option) => {
      const optionBooked = alreadyBooking.filter(
        (book) => book.treatment === option.name
      );
      const bookingSlots = optionBooked.map((book) => book.slot);
      const remainingSlots = option.slots.filter(
        (slot) => !bookingSlots.includes(slot)
      );
      // console.log(remainingSlots)
      // set this slots is remainingSlots
      option.slots = remainingSlots;
      // console.log(option.name , date, bookingSlots);
    });
    res.send(data);
  } catch (error) {
    console.log(error.name, error.message);
    res.send({
      status: false,
      message: error.message,
    });
  }
});

////  advance

app.get("/v2/appointmentOptions", async (req, res) => {
  const date = req.query.date;
  const data = await appointmentOptionCollection
    .aggregate([
      {
        $lookup: {
          from: "bookings",
          localField: "name",
          foreignField: "treatment",
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$appointmentDate", date],
                },
              },
            },
          ],
          as: "booked",
        },
      },
      {
        $project: {
          name: 1,
          slots: 1,
          booked: {
            $map: {
              input: "$booked",
              as: "book",
              in: "$$book.slot",
            },
          },
        },
      },
      {
        $project: {
          name: 1,
          slots: {
            $setDifference: ["$slots", "$booked"],
          },
        },
      },
    ])
    .toArray();
  res.send(data);
});

// get all the appointmentSpecialty use .project(fild)
app.get("/appointmentSpecialty", async (req, res) => {
  try {
    const query = {};
    const result = await appointmentOptionCollection
      .find(query)
      .project({ name: 1 })
      .toArray();

    res.send(result);
  } catch (error) {}
});

/* 
api Naming convention
app.get('/bookings)
app.get('/bookings/:id)
app.post('/bookings)
app.patch('/bookings/:id)
app.patch('/bookings/:id)
*/

app.get("/bookings", async (req, res) => {
  try {
    const email = req.query.email;
    const query = { email: email };
    const bookings = await bookingCollection.find(query).toArray();
    res.send(bookings);
  } catch (error) {
    res.send({
      status: false,
      message: error.message,
    });
  }
});

app.get("/bookings/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: ObjectId(id) };
    const data = await bookingCollection.findOne(query);
    res.send(data);
  } catch (error) {
    res.send(error.message);
  }
});

app.post("/payments", async (req, res) => {
  try {
    const data = req.body;
    console.log(data);
    const paymentResult = await paymentsCollection.insertOne(data);
    const id = data.bookingId;
    const filter = { _id: ObjectId(id) }
    const updateDoc = {
      $set:{
        paid: true,
        transactionId: data.transactionId
      }
    }
    const updateResult = await bookingCollection.updateOne(filter, updateDoc);
    res.send(paymentResult);
  } catch (error) {
    console.log(error.name, error.message);
  }
});

app.post("/bookings", async (req, res) => {
  try {
    const booking = req.body;
    const query = {
      appointmentDate: booking.appointmentDate,
      email: booking.email,
      treatment: booking.treatment,
    };

    const alreadyBooking = await bookingCollection.find(query).toArray();
    if (alreadyBooking.length) {
      const message = `You already have a booking on ${booking.appointmentDate}`;
      return res.send({ acknowledged: false, message });
    }
    const result = await bookingCollection.insertOne(booking);
    res.status(200).send({
      status: true,
      data: result,
    });
  } catch (error) {
    res.status(403).send({
      status: false,
      message: error.message,
    });
  }
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const booking = req.body;
    const price = booking.price;
    const amount = price * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      currency: "usd",
      amount: amount,
      payment_method_types: ["card"],
    });
    res.send({
      clientSecret: paymentIntent.client_secret,
    });
    // console.log(paymentIntent);
  } catch (error) {
    console.log(error.message);
  }
});

app.get("/jwt", async (req, res) => {
  try {
    const email = req.query.email;
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    if (user) {
      const token = jwt.sign({ email }, process.env.SECRET_KEY, {
        expiresIn: "1h",
      });
      return res.send({ accessToken: token });
    }
    // res.status(403).send(user)
    res.status(403).send({ accessToken: "" });
  } catch (error) {
    // console.log(error.message);
    res.send({ accessToken: "" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const query = {};
    const users = await usersCollection.find(query).toArray();
    if (!users) {
      res.send({ authentication: false });
    }
    res.send(users);
  } catch (error) {
    res.send({ authentication: false });
  }
});

app.post("/users", async (req, res) => {
  try {
    const user = req.body;
    const result = await usersCollection.insertOne(user);
    res.send(result);
  } catch (error) {
    res.send({
      status: false,
      message: error.message,
    });
  }
});

app.get("/users/admin/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const query = { email };
    const foundUser = usersCollection.findOne(query);
    res.send({ isAdmin: foundUser?.role === "admin" });
  } catch (error) {
    res.send({ message: "unAuthRation" });
  }
});

app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const filter = { _id: ObjectId(id) };
    const options = { upsert: true };
    const updateDoc = {
      $set: {
        role: "admin",
      },
    };
    const result = await usersCollection.updateOne(filter, updateDoc, options);
    res.send(result);
  } catch (error) {
    res.status(401).send({});
  }
});

//                        ------------------------------------------------
// app.put("/doctors", async (req, res) => {
//   try {
//     const query = {};

//     const options = { upsert: true };
//     const updateDoc = {
//       $set: {
//         price: 199,
//       },
//     };
//     const result = await appointmentOptionCollection.updateMany(
//       query,
//       updateDoc,
//       options
//     );
//     res.send(result);
//   } catch (error) {
//     res.send(error.message);
//   }
// });

// add doctors
app.get("/doctors", async (req, res) => {
  try {
    const query = {};
    const data = await doctorsCollection.find(query).toArray();
    res.send(data);
  } catch (error) {
    res.send(error?.message);
  }
});

app.post("/doctors", async (req, res) => {
  try {
    const doctors = req.body;
    const result = await doctorsCollection.insertOne(doctors);
    res.send(result);
  } catch (error) {
    res.send(error?.message);
  }
});
app.delete("/doctors/:id", async (req, res) => {
  try {
    const query = { _id: ObjectId(req.params.id) };
    const data = await doctorsCollection.deleteOne(query);
    res.send(data);
  } catch (error) {
    res.send(error.message);
  }
});
app.listen(port, () => {
  console.log(`port is running ${port}`);
});
