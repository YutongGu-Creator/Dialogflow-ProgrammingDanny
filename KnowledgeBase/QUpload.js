'use strict';

const axios = require('axios');
const quiz = require('./DynamicQuiz.json');

for (let i in quiz) {

    // send a POST request
    axios({
        method: 'post',
        url: '',
        data: {
            difficulty: quiz[i].difficulty,
            content: quiz[i].content
        }
    })
        .then(() => { console.log(`${quiz[i].difficulty} is updated successful`) })
        .catch(err => { console.log(err) });
}



/*
    {
        "name": "",
        "content": {
            "quiz1": {
                "quiz": "",
                "a": "",
                "b": "",
                "c": "",
                "d": "Not sure",
                "answer": ""
            },
            "quiz2": {
                "quiz": "",
                "a": "",
                "b": "",
                "c": "",
                "d": "Not sure",
                "answer": ""
            },
            "quiz3": {
                "quiz": "",
                "a": "",
                "b": "",
                "c": "",
                "d": "Not sure",
                "answer": ""
            }
        }
    }
*/