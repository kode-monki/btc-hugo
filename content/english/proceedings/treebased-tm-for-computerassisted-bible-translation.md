---
title: "Tree-Based TM for Computer-Assisted Bible Translation"
date: "2019-10-11"
start_time: "3:00 PM"
end_time: ""
publicity: ""
location: "6-Travis"
author: "ANDI WU"
author_id: "andi-wu"
year: "2019"
track: []
slides_url: ""
paper_url: "https://drive.google.com/open?id=0B7RR6AskRWy-aUdLUTdaWThnS0ZzWllvSmpxeGJueXp6T293"
video_url: ""
is_plenary: false
lecture: ""
plenary_weight: 0
presenter_ids: []
author_ids: []
---

TM (translation memory) is a database that stores the translation units that have been previously translated.  It can be used in computer-assisted Bible translation to provide suggestions when new texts are translated, thus improving efficiency and consistency in translation.  This paper presents an automatic way of incrementally creating a TM in real time as a translation project goes on.  What is required in this approach is (1) an automatic word aligner, and (2) syntactic treebanks of the original Hebrew and Greek texts.  After each verse is translated, the auto-aligner is used to align the translation words to their corresponding Hebrew/Greek words which are the leaf nodes in a syntactic tree.  Since each node in the tree (a subtree) represents a word, phrase, or clause, phrase/clause alignment can also be automatically created by mapping the sequence of leaf nodes in the subtree to the translation words aligned to these nodes, resulting in a TM that contains linguistically valid translation units of any textual size.  As such a TM grows, Bible translators get increasing better suggestions.  
   
This approach differs from traditional methods of TM creation where translation units beyond the word level are arbitrary word sequences which are hard to identify automatically, and which are not always legitimate linguistic units.  We are able to avoid these problems due to existence of syntactic treebanks of Biblical texts.  Such resources are seldom available in other domains.