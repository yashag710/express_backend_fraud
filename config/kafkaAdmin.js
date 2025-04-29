const kafka = require('./kafkaConfig');

const createTopics = async () => {
  const admin = kafka.admin();

  try {
    await admin.connect();
    console.log('Connected to Kafka admin');    
    await admin.createTopics({
      topics: [
        {
          topic: 'transaction-requests',
          numPartitions: 4,
        }
      ]
    });
    console.log('Topics created successfully');
  } catch (error) {
    console.error('Error creating topics:', error);
  } finally {
    await admin.disconnect();
  }
};

module.exports = { createTopics };