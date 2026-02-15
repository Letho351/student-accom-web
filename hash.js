const bcrypt = require("bcryptjs");

async function run() {
    const password = "Collins123";
    const hash = await bcrypt.hash(password, 10);
    console.log("Use this hash in your database:\n", hash);
}

run();
