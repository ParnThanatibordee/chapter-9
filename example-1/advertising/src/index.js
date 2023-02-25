const express = require("express");
const mongodb = require("mongodb");
const amqp = require('amqplib');
const bodyParser = require("body-parser");

//
// Connect to the database.
//
function connectDb(dbHost, dbName) {
    return mongodb.MongoClient.connect(dbHost, { useUnifiedTopology: true }) 
        .then(client => {
            const db = client.db(dbName);
            return {                // Return an object that represents the database connection.
                db: db,             // To access the database...
                close: () => {      // and later close the connection to it.
                    return client.close();
                },
            };
        });
}

//
// Connect to the RabbitMQ server.
//
function connectRabbit(rabbitHost) {

    // console.log(`Connecting to RabbitMQ server at ${rabbitHost}.`);

    return amqp.connect(rabbitHost) // Connect to the RabbitMQ server.
        .then(messagingConnection => {
            // console.log("Connected to RabbitMQ.");

            return messagingConnection.createChannel(); // Create a RabbitMQ messaging channel.
        });
}

//
// Define your HTTP route handlers here.
//
async function setupHandlers(microservice) {

    const advertisingCollection = microservice.db.collection("advertising");
    const countRow = await advertisingCollection.countDocuments({ "_id": { "$exists": true } })

    const mockCollection = [
        {
            name: "Agoda",
            url: "https://www.agoda.com/"
        },
        {
            name: "Kasetsart University",
            url: "https://www.ku.ac.th/"
        }
    ]

    console.log("*", countRow)


    //
    // HTTP GET API to retrieve list of videos from the database.
    //
    microservice.app.get("/advertising", (req, res) => {
        return advertisingCollection.find() 
            .toArray()
            .then(ads => {
                res.json({
                    ads: ads[Math.floor(Math.random() * countRow)]
                });
            })
            .catch(err => {
                console.error("Failed to get ads collection from database!");
                console.error(err && err.stack || err);
                res.sendStatus(500);
            });

    });

    
}

//
// Starts the Express HTTP server.
//
function startHttpServer(dbConn, messageChannel) {
    return new Promise(resolve => { // Wrap in a promise so we can be notified when the server has started.
        const app = express();
        const microservice = { // Create an object to represent our microservice.
            app: app,
            db: dbConn.db,
			messageChannel: messageChannel,
        };
		app.use(bodyParser.json()); // Enable JSON body for HTTP requests.
        setupHandlers(microservice);

        const port = process.env.PORT && parseInt(process.env.PORT) || 3000;
        const server = app.listen(port, () => {
            microservice.close = () => { // Create a function that can be used to close our server and database.
                return new Promise(resolve => {
                    server.close(() => { // Close the Express server.
            resolve();
        });
                })
                .then(() => {
                    return dbConn.close(); // Close the database.
                });
            };
            resolve(microservice);
        });
    });
}

//
// Collect code here that executes when the microservice starts.
//
function startMicroservice(dbHost, dbName, rabbitHost) {
    return connectDb(dbHost, dbName)        	// Connect to the database...
        .then(dbConn => {                   	// then...
			return connectRabbit(rabbitHost)    // connect to RabbitMQ...
				.then(messageChannel => {		// then...
            		return startHttpServer(		// start the HTTP server.
						dbConn, 
						messageChannel
					);	
				});
        });
}

//
// Application entry point.
//
function main() {
    if (!process.env.DBHOST) {
        throw new Error("Please specify the databse host using environment variable DBHOST.");
    }
    
    const DBHOST = process.env.DBHOST;

    if (!process.env.DBNAME) {
        throw new Error("Please specify the databse name using environment variable DBNAME.");
    }
    
    const DBNAME = process.env.DBNAME;
        
	if (!process.env.RABBIT) {
	    throw new Error("Please specify the name of the RabbitMQ host using environment variable RABBIT");
	}
	
	const RABBIT = process.env.RABBIT;

    return startMicroservice(DBHOST, DBNAME, RABBIT);
}

if (require.main === module) {
    // Only start the microservice normally if this script is the "main" module.
	main()
	    .then(() => console.log("Microservice online."))
	    .catch(err => {
	        console.error("Microservice failed to start.");
	        console.error(err && err.stack || err);
	    });
}
else {
    // Otherwise we are running under test
    module.exports = {
        startMicroservice,
    };
}

