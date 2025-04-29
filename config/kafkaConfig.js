const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'fraud-detection-app',
    brokers: ['localhost:9092'],
    retry: {
        initialRetryTime: 100,
        initialRetries: 8
    }
});

module.exports = kafka;
