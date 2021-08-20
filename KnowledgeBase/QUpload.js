'use strict';

const axios = require('axios');
const quiz = require('./DynamicQuiz.json');

for (let i in quiz) {

    // send a POST request
    axios({
        method: 'post',
        url: 'https://us-central1-programmingdanny-5a8b2.cloudfunctions.net/dynamicQuizUpload',
        data: {
            difficulty: quiz[i].difficulty,
            content: quiz[i].content
        }
    })
        .then(() => { console.log(`${quiz[i].difficulty} is updated successful`) })
        .catch(err => { console.log(err) });
}