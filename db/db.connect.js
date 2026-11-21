
const mongoose = require("mongoose");
require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = {
        conn: null,
        promise: null
    };
}

const initializeDatabase = async () => {
    if (cached.conn) {
        return cached.conn;
    }

    if (!process.env.MONGODB) {
        throw new Error("MONGODB environment variable is missing");
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGODB)
            .then((mongooseInstance) => mongooseInstance)
            .catch((error) => {
                cached.promise = null;
                throw error;
            });
    }

    cached.conn = await cached.promise;
    return cached.conn;
};

module.exports = { initializeDatabase };
