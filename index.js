
const express = require("express");
const app = express();
const cors = require("cors");
const http = require("http");
const dotenv = require("dotenv");
const { initializeDatabase } = require("./db/db.connect");
const authRoutes = require("./routes/auth");
const { Server } = require("socket.io");

const Messages = require("./models/messages.model");
const User = require("./models/user.model");

dotenv.config();

app.use(express.json());

app.use(cors({
    origin: [
        "http://localhost:3000",
        process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE"]
}));

// Wait for MongoDB before handling API requests
app.use(async (req, res, next) => {
    try {
        await initializeDatabase();
        next();
    } catch (error) {
        console.error("Database connection error:", error.message);
        res.status(500).json({
            message: "Database connection failed"
        });
    }
});

// Authentication routes
app.use("/auth", authRoutes);

// HTTP server and Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
    path: "/socket.io",
    cors: {
        origin: [
            "http://localhost:3000",
            process.env.FRONTEND_URL
        ].filter(Boolean),
        methods: ["GET", "POST"]
    }
});

// Socket.IO events
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("register_user", (username) => {
        socket.join(username);
        console.log(`${username} joined their room`);
    });

    // Send message
    socket.on("send_message", async (data) => {
        try {
            await initializeDatabase();

            const { sender, receiver, message } = data;

            const newMessage = new Messages({
                sender,
                receiver,
                message
            });

            await newMessage.save();

            socket.emit("message_sent", newMessage);
            io.to(receiver).emit("receive_message", newMessage);

        } catch (error) {
            console.error("Error sending message:", error);
        }
    });

    // Typing indicator
    socket.on("typing", (data) => {
        io.to(data.receiver).emit("user_typing", {
            username: data.sender
        });
    });

    // Stop typing
    socket.on("stop_typing", (data) => {
        io.to(data.receiver).emit("user_stop_typing", {
            username: data.sender
        });
    });

    // Message delivered
    socket.on("message_delivered", async (messageId) => {
        try {
            await initializeDatabase();

            const message = await Messages.findByIdAndUpdate(
                messageId,
                { status: "delivered" },
                { new: true }
            );

            if (message) {
                io.to(message.sender).emit("message_status", {
                    messageId,
                    status: "delivered"
                });
            }
        } catch (error) {
            console.error("Delivery status error:", error);
        }
    });

    // Message read
    socket.on("message_read", async (messageId) => {
        try {
            await initializeDatabase();

            const message = await Messages.findByIdAndUpdate(
                messageId,
                { status: "read" },
                { new: true }
            );

            if (message) {
                io.to(message.sender).emit("message_status", {
                    messageId,
                    status: "read"
                });
            }
        } catch (error) {
            console.error("Read status error:", error);
        }
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// Fetch messages
app.get("/messages", async (req, res) => {
    const { sender, receiver } = req.query;

    if (!sender || !receiver) {
        return res.status(400).json({
            message: "Sender and receiver are required"
        });
    }

    try {
        const messages = await Messages.find({
            $or: [
                { sender, receiver },
                { sender: receiver, receiver: sender }
            ]
        }).sort({ createdAt: 1 });

        res.json(messages);

    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({
            message: "Error fetching messages"
        });
    }
});

// Fetch users
app.get("/users", async (req, res) => {
    const { currentUser } = req.query;

    try {
        const users = await User.find({
            username: { $ne: currentUser }
        }).select("-password");

        res.json(users);

    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({
            message: "Error fetching users"
        });
    }
});

// Health check
app.get("/", (req, res) => {
    res.json({
        message: "Chat Application Backend is running"
    });
});

module.exports = server;
