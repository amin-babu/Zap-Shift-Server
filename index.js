const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

//middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qyacehm.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const db = client.db('zap_shift_db');
    const parcelsCollection = db.collection('parcels');
    const paymentCollection = db.collection('payments');

    // parcels api
    app.get('/parcels', async (req, res) => {
      const query = {};

      // to be like that -> http://localhost:3000/parcels?email=badrulaminbabu@gmail.com
      const { email } = req.query;
      if (email) {
        query.senderEmail = email;
      };

      const options = { sort: { createdAt: -1 } };

      const cursor = parcelsCollection.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/parcels/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.findOne(query);
      res.send(result);
    });

    app.post('/parcels', async (req, res) => {
      const parcel = req.body;
      parcel.createdAt = new Date(); // parcel created time
      const result = await parcelsCollection.insertOne(parcel);
      res.send(result);
    });

    app.delete('/parcels/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelsCollection.deleteOne(query);
      res.send(result);
    });

    app.patch('/payment-success', async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log('session retrieve:', session);
      if (session.payment_status === 'paid') {
        const id = session.metadata.parcelId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: 'paid'
          }
        };
        const result = await parcelsCollection.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          percelName: session.metadata.percelName,
          transactionId: session.payment_intent,
          paymentStatus: session.paymentStatus,
          paidAt: new Date(),
          trackingId: ''
        };

        if(session.payment_status === 'paid'){
          const resultPayment = await paymentCollection.insertOne(payment);
          res.send({success: true, modifyParcel: result, paymentInfo: resultPayment});
        };

      }
      res.send({ success: false });
    });

    // payment realted API
    app.post('/payment-checkout-session', async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'USD',
              unit_amount: amount,
              product_data: {
                name: `Please pay for: ${paymentInfo.percelName}`
              }
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        metadata: {
          parcelId: paymentInfo.parcelId
        },
        customer_email: paymentInfo.senderEmail,
        success_url: `${process.env.SIDE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SIDE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });

    // old
    app.post('/create-checkout-session', async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'USD',
              unit_amount: amount,
              product_data: {
                name: paymentInfo.percelName
              }
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: 'payment',
        metadata: {
          parcelId: paymentInfo.parcelId,
          percelName: paymentInfo.percelName
        },
        success_url: `${process.env.SIDE_DOMAIN}/dashboard/payment-success`,
        cancel_url: `${process.env.SIDE_DOMAIN}/dashboard/payment-cancelled`,
      });

      console.log(session);
      res.send({ url: session.url });
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Zap is shifting')
});

app.listen(port, () => {
  console.log(`Zap app listening on port ${port}`)
});
