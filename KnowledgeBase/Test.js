"use strict"

let quizs = ["java_basics", "java_flow_control", "oop_basics_part1"];

// Return an integer from 0 to max-1
function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

console.log(quizs[getRandomInt(2)]);