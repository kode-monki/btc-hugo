---
title: "Using Syntax Parsing to Enable Machine Translation for Language Pairs with Thorny Differences"
publicity: "abstract-only"
author: "Ron Lockwood"
author_id: "ron-lockwood"
year: "2021"
track: ["Technology & Innovation"]
slides_url: "https://drive.google.com/file/d/1pssbgheI2ZCZ6jLHvup1DFBVL2I-qiUL/view"
paper_url: "https://drive.google.com/file/d/1_iqn9FK8wRep-pZ3P8TH4gny1nyikFN3/view"
video_url: ""
---
<p>Linguistically-based machine translation tools like FLExTrans or CARLA give projects a valuable way to adapt the Bible from one language to another. But when, however, there are word order differences or case-marking differences, the results are not satisfactory. Using syntax parsing technologies, these differences can be overcome. I present the results of using these technologies in conjunction with FLExTrans. The system is producing good translations in a real language project. I outline various linguistic differences between the source and target languages that presented significant challenges and how these challenges were overcome. FLExTrans is a machine translation tool, useful for speeding up translation of the Bible. The syntax parsing tools are a front-end to FLExTrans. They are designed to produce all possible correct syntax trees for the source language text (given a set of syntax rules and the lexicon) sentence by sentence. The user chooses the correct tree in each case and the output is displayed as an interlinear text in SIL’s FieldWorks Language Explorer (FLEx) program. It is with syntax parsing that case-marking differences can be overcome. Also, with the syntax tree information at hand, tree modifying tools can be applied to change the syntax tree in various ways. This is how word order differences can be overcome. All this prepares the source text for use in FLExTrans. These technologies open the door to doing linguistically-based machine translation between languages where it was not possible or satisfactory before.</p>